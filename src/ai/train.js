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
const TradeKind = require('../core/TradeKind')
const CandlesMap = require('./CandlesMap')

/**
 * Simulates trades based on the provided parameters.
 * @param {BinanceRawReader} brr - Binance raw reader instance
 * @param {number} startTradingIndex - Index of the trade to use as entry point
 * @param {object} config - Configuration object
 * @returns {Promise<object|null>} - Simulated trade results or null if skipped
 */
const simulateTrades = async (brr, startTradingIndex, config, pastSimulationsTimeouts) => {
    const maxHoldingTimeUs = (config.maxHoldingTimeMin || 120) * 60 * 1000000
    const firstTrade = await brr.readTrade(startTradingIndex)
    const buyOrder = {
        kind: TradeKind.buy,
        enter: null,
        lastProfitPercent: null,
        profitPercent: null,
        durationUs: -1,
        forceClose: false,
        tradesCount: 0

    }
    const sellOrder = {
        kind: TradeKind.sell,
        enter: null,
        lastProfitPercent: null,
        profitPercent: null,
        durationUs: -1,
        forceClose: false,
        tradesCount: 0
    }

    /**
     * Process an order to evolve its internal state.
     * @param {{kind: {TradeKind}, enter: {number}, profitPercent: {number}}} order
     */
    const process = (order, currentPrice, currentDurationUs, forceClose) => {
        if (order.enter === null) {
            order.enter = currentPrice
        }
        order.durationUs = currentDurationUs
        order.forceClose = forceClose
        order.tradesCount++
        const profit = order.kind === TradeKind.buy
            ? currentPrice - order.enter
            : order.enter - currentPrice
        order.lastProfitPercent = profit / order.enter
        if ((order.lastProfitPercent >= config.profitTargetPercent) ||
            (order.lastProfitPercent <= -1 * config.stopLossPercent) ||
            forceClose
        ) {
            order.profitPercent = order.lastProfitPercent
        }
    }
    const inspectedTrades = []
    for (let i = startTradingIndex; i < brr.info.recordsCount; i++) {
        if ((buyOrder.profitPercent !== null) && (sellOrder.profitPercent !== null)) break
        const trade = await brr.readTrade(i)
        inspectedTrades.push(trade)
        const currentDurationUs = trade.tsUs - firstTrade.tsUs
        const forceClose = currentDurationUs >= maxHoldingTimeUs
        switch (trade.kind) {
            case TradeKind.buy:{
                process(buyOrder, trade.price, currentDurationUs, forceClose)
                break
            }
            case TradeKind.sell:
                process(sellOrder, trade.price, currentDurationUs, forceClose)
                break
            default:
                return null
        }
        if (forceClose) {
            if (pastSimulationsTimeouts.limit === 0) {
                break
            } else {
                pastSimulationsTimeouts.count++
                if (pastSimulationsTimeouts.count >= pastSimulationsTimeouts.limit) {
                    return null
                } else {
                    break
                }
            }
        }
    }

    if (pastSimulationsTimeouts.limit !== 0) {
        if (buyOrder.profitPercent !== null && sellOrder.profitPercent !== null) { pastSimulationsTimeouts.count = 0 }
    }

    const closeOrder = (order) => {
        if (order.profitPercent !== null) return
        if (order.lastProfitPercent !== null) {
            order.profitPercent = order.lastProfitPercent
            order.forceClose = true
        }
    }

    closeOrder(buyOrder)
    closeOrder(sellOrder)

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

    return { buyOrder, sellOrder, operation }
}

/**
 * Create a training sample from the specified number of candles
 * @param {Candle[]} candles - the array of candles
 * @param {number} trainingLength - how many candles to use for training. they will be taken from the end of the candles array
 * @param {BinanceRawReader} brr - Binance raw reader instance which will be used to read trades for outcome calculation
 * @param {number} startTradingIndex - the index of the trade to use as entry point for outcome calculation
 * @returns  {object} Training sample with inputs and outputs
 */
const createTrainingSample = async (candles, trainingLength, brr, startTradingIndex, config, pastSimulationsTimeouts) => {
    // simulate the trades
    const simulation = await simulateTrades(brr, startTradingIndex, config, pastSimulationsTimeouts)
    if (!simulation) {
        return null
    }
    const { buyOrder, sellOrder, operation } = simulation

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

    const scale = (value) => Math.max(-config.outputMultiplicationFactor, Math.min(value * config.outputMultiplicationFactor, config.outputMultiplicationFactor))

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
    const baseFolder = path.resolve(__dirname, '..', '..', 'data')
    result.tradesBinaryFilePath = path.resolve(baseFolder, `${result.exchangeName}_${result.symbol.id}_trades.bin`)
    const brr = BinanceRawReader.create(result.tradesBinaryFilePath, result.symbol)
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
    const candlesMap = await CandlesMap.create(config)
    const candlesCount = candlesMap.length
    const candlesPreambleCount = 100
    const brr = BinanceRawReader.create(config.availableDataRange.filePath, config.symbol)
    const pastSimulationsTimeouts = { count: 0, limit: config.pastSimulationsTimeoutsLimit }
    let i = 0
    while (true) {
        i++
        const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount
        const randomStartIndex = Math.floor(Math.random() * (candlesCount - requiredCandlesCount))
        const candlesInfo = candlesMap.bulkGet(
            brr,
            randomStartIndex,
            requiredCandlesCount
        )
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }
        const tradeIndex = candlesInfo.startTradeIndex + candlesInfo.tradesCount
        const sample = await createTrainingSample(candlesInfo.candles, 120, brr, tradeIndex, config, pastSimulationsTimeouts)

        // Skip samples with null outcomes
        if (sample === null) { continue }

        const trainResult = await nn.train([sample])

        /**
         * Pretty print a price with left padding for integer part and fixed fractional digits
         * @param {number} value
         * @param {number} integerDigitsCount
         * @param {number} fractionalDigitsCount
         * @returns {string}
         */
        const prettyPrintPrice = (value, integerDigitsCount, fractionalDigitsCount) => {
            // Print the number as usual (with sign), then pad with spaces on the left
            const numStr = value.toFixed(fractionalDigitsCount)
            // Calculate total width: sign + integerDigitsCount + dot + fractionalDigitsCount
            // But sign is included in numStr, so just pad to (integerDigitsCount + 1 + fractionalDigitsCount)
            const totalWidth = integerDigitsCount + 1 + fractionalDigitsCount
            return numStr.padStart(totalWidth, ' ')
        }

        const pp = [
            ['Sample', i.toString().padStart(6, '0')],
            ['idx', randomStartIndex.toString().padStart(7, ' ')],
            ['Trade', tradeIndex.toString().padStart(9, '0')],
            ['Candle', candlesInfo.candles[0].id.toString().padStart(9, '0')],
            ['Loss', prettyPrintPrice(trainResult.history.loss[0], 4, 4)],
            ['MAE', prettyPrintPrice(trainResult.history.mae[0], 4, 4)],
            ['MSE', prettyPrintPrice(trainResult.history.mse[0], 4, 4)],
            ['Buy', `${prettyPrintPrice(sample.outputs.buyProfitPercent, 4, 4)}/${Math.floor(sample.buyOrder.durationUs / 60000000)}/${sample.buyOrder.forceClose ? '1' : '0'}/${sample.buyOrder.tradesCount}`],
            ['Sell', `${prettyPrintPrice(sample.outputs.sellProfitPercent, 4, 4)}/${Math.floor(sample.sellOrder.durationUs / 60000000)}/${sample.sellOrder.forceClose ? '1' : '0'}/${sample.sellOrder.tradesCount}`],
            ['TradesCount', candlesInfo.tradesCount.toString()]
        ]
        console.log(pp.map(pair => `${pair[0]} ${pair[1]}`).join(' | '))
    }
}

const work = async () => {
    const config = getConfig(process.argv[2] ?? 'binance_btcusdc')
    await feed(0, config)
}

work()
