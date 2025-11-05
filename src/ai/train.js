const Candle = require('../core/Candle')
const Macd = require('../instruments/macd')
const { getConfig, createNn, simulateTrades } = require('./common')

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
    const simulation = await simulateTrades(startTradingIndex, config, pastSimulationsTimeouts)
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
 *  Feed data for training
 * @param {number} identity
 * @param {{exchangeName: string, symbol: Symbol, totalHistoryInDays: number, candleDurationMinutes: number, candlesPerWindow: number, extraCandlesPerWindowSide: number, availableDataRange: {filePath: string, fileSize: number, startTimestampUs: number, endTimestampUs: number, recordsCount: number, durationUs: number}}} config
 */
const feed = async (nn, config) => {
    const fs = require('fs')
    const candlesCount = config.candlesMap.length
    const candlesPreambleCount = 100
    const pastSimulationsTimeouts = { count: 0, limit: config.pastSimulationsTimeoutsLimit }
    let printCsv = null
    const printCsvWithoutColumns = (data) => {
        const line = Object.values(data).map(v => {
            if (typeof v === 'number') {
                return Number.isInteger(v) ? v.toString() : v.toFixed(10)
            }
            return v
        }).join(',')
        console.log(line)
        fs.appendFileSync(config.learnLogPath, line + '\n')
    }
    const printCsvWithColumns = (data) => {
        if (!fs.existsSync(config.learnLogPath)) {
            const headers = Object.keys(data).join(',')
            console.log(headers)
            fs.writeFileSync(config.learnLogPath, headers + '\n')
        }
        printCsvWithoutColumns(data)
        printCsv = printCsvWithoutColumns
    }
    printCsv = printCsvWithColumns
    let i = 0
    let lastSavedAt = Date.now()
    while (true) {
        if (config.autosaveIntervalSeconds) {
            const now = Date.now()
            if (now - lastSavedAt >= config.autosaveIntervalSeconds * 1000) {
                await nn.save()
                lastSavedAt = now
            }
        }
        i++
        const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount
        const randomStartIndex = Math.floor(Math.random() * (candlesCount - requiredCandlesCount))
        const candlesInfo = config.candlesMap.bulkGet(
            config.brr,
            randomStartIndex,
            requiredCandlesCount
        )
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }
        const tradeIndex = candlesInfo.startTradeIndex + candlesInfo.tradesCount
        const sample = await createTrainingSample(candlesInfo.candles, 120, config.brr, tradeIndex, config, pastSimulationsTimeouts)

        // Skip samples with null outcomes
        if (sample === null) { continue }

        const trainResult = await nn.train([sample])

        printCsv({
            SampleIndex: i,
            StartCandleIndex: randomStartIndex,
            StartCandleId: candlesInfo.candles[0].id,
            TradeIndex: tradeIndex,
            Loss: trainResult.history.loss[0],
            MAE: trainResult.history.mae[0],
            MSE: trainResult.history.mse[0],
            BuyProfitPercent: sample.outputs.buyProfitPercent,
            BuyOrderDuration: sample.buyOrder.durationUs,
            BuyOrderForcedClose: sample.buyOrder.forceClose,
            BuyOrderTradesCount: sample.buyOrder.tradesCount,
            SellProfitPercent: sample.outputs.sellProfitPercent,
            SellOrderDuration: sample.sellOrder.durationUs,
            SellOrderForcedClose: sample.sellOrder.forceClose,
            SellOrderTradesCount: sample.sellOrder.tradesCount
        })
    }
}

const work = async () => {
    const config = await getConfig(process.argv[2] ?? 'binance_btcusdc')
    const nn = await createNn(config)
    await feed(nn, config)
}

work()
