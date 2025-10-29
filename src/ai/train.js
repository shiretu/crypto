const { EventEmitter } = require('events')
const Symbol = require('../core/Symbol')
const Candle = require('../core/Candle')
const NN = require('../ai/nn')
const { getSource } = require('../sources/sources')
const CandlesGenerator = require('../core/CandlesGenerator')
const EventName = require('../core/EventName')
const Macd = require('../instruments/macd')
const path = require('path')
const BinanceRawReader = require('../sources/BinanceRawReader')

/**
 * Create a training sample from 120 candles
 * @param {Candle[]} candles - the array of candles
 * @param {number} trainingLength - how many candles to use for training. they will be taken from the end of the candles array
 * @param {BinanceRawReader} brr - Binance raw reader instance which will be used to read trades for outcome calculation
 * @param {number} outcomeEntryTradeIndex - the index of the trade to use as entry point for outcome calculation
 * @returns  {object} Training sample with inputs and outputs
 */
const createTrainingSample = async (candles, trainingLength, brr, outcomeEntryTradeIndex, config) => {
    const enterTrade = await brr.readTrade(outcomeEntryTradeIndex)
    const enterPrice = enterTrade.price
    const buyOrder = {
        profitPercent: null,
        durationUs: 0
    }
    const sellOrder = {
        profitPercent: null,
        durationUs: 0
    }
    const maxHoldingTimeUs = (config.maxHoldingTimeMin || 120) * 60 * 1000000
    for (let tradeIndex = outcomeEntryTradeIndex + 1; tradeIndex < brr.info.recordsCount; tradeIndex++) {
        if ((buyOrder.profitPercent !== null) && (sellOrder.profitPercent !== null)) break
        const trade = await brr.readTrade(tradeIndex)
        if (buyOrder.profitPercent === null) {
            const profit = trade.price - enterPrice
            const percent = profit / enterPrice
            if ((percent >= config.profitTargetPercent) ||
                (percent <= -1 * config.stopLossPercent) ||
                (trade.tsUs - enterTrade.tsUs) > maxHoldingTimeUs) {
                buyOrder.profitPercent = percent
                buyOrder.durationUs = trade.tsUs - enterTrade.tsUs
            }
        }
        if (sellOrder.profitPercent === null) {
            const profit = enterPrice - trade.price
            const percent = profit / enterPrice
            if ((percent >= config.profitTargetPercent) ||
                 (percent <= -1 * config.stopLossPercent) ||
                 (trade.tsUs - enterTrade.tsUs) > maxHoldingTimeUs) {
                sellOrder.profitPercent = percent
                sellOrder.durationUs = trade.tsUs - enterTrade.tsUs
            }
        }
    }

    // Skip samples with null outcomes to prevent training issues
    if (buyOrder.profitPercent === null || sellOrder.profitPercent === null) {
        console.log('Skipping sample due to null outcomes')
        return null // Signal to skip this sample
    }

    const operation = (() => {
        if (buyOrder.profitPercent > 0) {
            if (sellOrder.profitPercent > 0) {
                return buyOrder.profitPercent >= sellOrder.profitPercent ? 1 : -1
            } else {
                return 1
            }
        } else {
            if (sellOrder.profitPercent > 0) {
                return -1
            } else {
                return 0
            }
        }
    })()

    // normalize the candles
    Candle.normalize(candles)

    // Extract the training candles
    const trainingCandles = candles.slice(-1 * trainingLength)

    // signals computations
    const macdComputer = new Macd()
    const macd = []
    const start = candles.length - trainingLength
    candles.forEach((candle, index) => {
        macdComputer.push(candle.close.normalizedPrice)
        if (index >= start && index < start + trainingLength) {
            macd.push(macdComputer.value)
        }
    })

    const scale = (value) => Math.min(value * config.outputMultiplicationFactor, config.outputMultiplicationFactor)

    // Create training sample structure
    return {
        inputs: {
            candles: {
                opens: trainingCandles.map(c => c.open.normalizedPrice),
                highs: trainingCandles.map(c => c.high.normalizedPrice),
                lows: trainingCandles.map(c => c.low.normalizedPrice),
                closes: trainingCandles.map(c => c.close.normalizedPrice),
                volumes: trainingCandles.map(c => c.normalizedQuoteVolume),
                timestamps: trainingCandles.map(c => c.normalizedMinuteOfDay),
                colors: trainingCandles.map(c => c.direction),
                bodySizes: trainingCandles.map(c => c.normalizedHeight),
                tradesCount: trainingCandles.map(c => c.normalizedTradesCount)
            },
            studies: {
                macdShort: macd.map(m => m.short),
                macdLong: macd.map(m => m.long),
                macdLine: macd.map(m => m.macd),
                macdSignal: macd.map(m => m.signal),
                macdHistogram: macd.map(m => m.histogram),
                unused1: new Array(119).fill(0),
                unused2: new Array(118).fill(0)
            },
            patterns: {
                single: new Array(119).fill(0),
                sliding: new Array(118).fill(0)
            },
            global: {
                candleDuration: trainingCandles[0].periodUs / 60000000,
                windowSize: trainingLength,
                grossProfitTarget: config.profitTargetPercent,
                grossStopLoss: config.stopLossPercent,
                positionSize: config.positionSize,
                fees: config.feesPercent
            }
        },
        outputs: {
            buyProfitPercent: scale(buyOrder.profitPercent),
            sellProfitPercent: scale(sellOrder.profitPercent),
            operation
        },
        buyOrder,
        sellOrder
    }
}

/**
 * Check if candles are continuous without significant gaps.
 * @param {Candle[]} candles
 * @returns true if candles are fine
 */
const checkCandleContinuity = (candles) => {
    for (let i = 1; i < candles.length; i++) {
        if ((candles[i].id - candles[i - 1].id) !== 1) {
            return false
        }
    }
    return true
}

/**
 * Get configuration for feeding data
 * @returns {{exchangeName: string, symbol: Symbol, totalHistoryInDays: number, candleDurationMinutes: number, candlesPerWindow: number, extraCandlesPerWindowSide: number, availableDataRange: {filePath: string, fileSize: number, startTimestampUs: number, endTimestampUs: number, recordsCount: number, durationUs: number}}}
 */
const getConfig = (modelName) => {
    const result = require(path.resolve(__dirname, '..', '..', 'models', modelName, 'config.json'))
    result.symbol = Symbol.find(result.symbol)
    result.modelName = modelName
    const brr = BinanceRawReader.create(path.resolve(__dirname, '..', '..', 'data', `${result.exchangeName}_${result.symbol.id}_trades.bin`), result.symbol)
    result.availableDataRange = brr.info
    result.availableDataRange.durationUs = result.availableDataRange.endTimestampUs - result.availableDataRange.startTimestampUs
    return result
}

/**
 *  Feed data for training
 * @param {number} identity
 * @param {{exchangeName: string, symbol: Symbol, totalHistoryInDays: number, candleDurationMinutes: number, candlesPerWindow: number, extraCandlesPerWindowSide: number, availableDataRange: {filePath: string, fileSize: number, startTimestampUs: number, endTimestampUs: number, recordsCount: number, durationUs: number}}} config
 */
const feed = async (identity, config) => {
    const nn = await NN.create({
        modelName: config.modelName,
        epochs: 1,
        autosave: 10
    })
    const candlesGenerator = new CandlesGenerator(null, config.exchangeName, config.symbol, config.candleDurationMinutes)
    const requiredCandlesCount = config.candlesPerWindow + 100
    const safeStartRegion = 50000
    const safeEndRegion = 1000000
    const safeRecordsCount = config.availableDataRange.recordsCount - safeEndRegion - safeStartRegion
    const brr = BinanceRawReader.create(config.availableDataRange.filePath, config.symbol, true)
    let i = 0
    while (true) {
        i++
        let index = safeStartRegion + Math.floor(Math.random() * safeRecordsCount)
        const candles = []
        candlesGenerator.reset()
        while (candles.length < requiredCandlesCount) {
            const trade = await brr.readTrade(index)
            index++
            if (!trade) {
                break
            }
            const candle = candlesGenerator.feed(trade)
            if (candle) {
                candles.push(candle)
            }
        }
        if (!checkCandleContinuity(candles)) { continue }
        const sample = await createTrainingSample(candles, 120, brr, index, config)

        // Skip samples with null outcomes
        if (sample === null) { continue }

        const trainResult = await nn.train([sample])

        // Pretty print training results
        const loss = trainResult.history.loss[0].toFixed(6)
        const mae = trainResult.history.mae[0].toFixed(6)
        const outputs = `Buy: ${sample.outputs.buyProfitPercent?.toFixed(4) || 'null'}/${Math.floor(sample.buyOrder.durationUs / 60000000)}, Sell: ${sample.outputs.sellProfitPercent?.toFixed(4) || 'null'}/${Math.floor(sample.sellOrder.durationUs / 60000000)}`

        console.log(`Sample ${i.toString().padStart(6, '0')} | Trade ${index.toString().padStart(9, '0')} | Candle: ${candles[0].id.toString().padStart(9, '0')} | Loss: ${loss} | MAE: ${mae} | ${outputs}`)
    }
}

const work = async () => {
    const config = getConfig(process.argv[2] ?? 'binance_btcusdc')
    await feed(0, config)
}

work()
