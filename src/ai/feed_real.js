const { EventEmitter } = require('events')
const Symbol = require('../core/Symbol')
const Candle = require('../core/Candle')
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
 * @returns  {object} Training sample with features and outcomes
 */
const createTrainingSample = async (candles, trainingLength, brr, outcomeEntryTradeIndex) => {
    // Extract the training candles
    const trainingCandles = candles.slice(-1 * trainingLength)

    // compute the base index for timestamps normalization
    const dayDurationUs = 24 * 60 * 60 * 1000 * 1000
    const followingMidnightUs = (Math.floor(trainingCandles[0].tsUs.open / dayDurationUs) + 1) * dayDurationUs
    const baseUs = (followingMidnightUs < trainingCandles[trainingCandles.length - 1].tsUs.close) ? followingMidnightUs : (followingMidnightUs - dayDurationUs)
    const baseIndex = baseUs / candles[0].periodUs

    // compute price normalization base
    const minPrice = Math.min(...candles.map(c => c.prices.low))
    const maxPrice = Math.max(...candles.map(c => c.prices.high))
    const minVolume = Math.min(...candles.map(c => c.volumes.quote))
    const maxVolume = Math.max(...candles.map(c => c.volumes.quote))
    const minHeight = Math.min(...candles.map(c => c.height))
    const maxHeight = Math.max(...candles.map(c => c.height))
    const minTradesCount = Math.min(...candles.map(c => c.tradeCount))
    const maxTradesCount = Math.max(...candles.map(c => c.tradeCount))
    const priceRange = maxPrice - minPrice
    const volumeRange = maxVolume - minVolume
    const heightRange = maxHeight - minHeight
    const tradesCountRange = maxTradesCount - minTradesCount

    // apply the normalization
    candles.forEach(candle => {
        candle.trades.forEach(trade => {
            trade.normalizedPrice = (trade.price - minPrice) / priceRange
        })
        candle.normalizedVolume = (candle.volumes.quote - minVolume) / volumeRange
        candle.normalizedHeight = (candle.height - minHeight) / heightRange
        candle.normalizedTradesCount = (candle.tradeCount - minTradesCount) / tradesCountRange
    })

    // Extract candle data
    const opens = trainingCandles.map(c => c.open.normalizedPrice)
    const highs = trainingCandles.map(c => c.high.normalizedPrice)
    const lows = trainingCandles.map(c => c.low.normalizedPrice)
    const closes = trainingCandles.map(c => c.close.normalizedPrice)
    const volumes = trainingCandles.map(c => c.normalizedVolume)
    const timestamps = trainingCandles.map(c => c.id - baseIndex)
    const colors = trainingCandles.map(c => c.direction)
    const bodySizes = trainingCandles.map(c => c.normalizedHeight)
    const tradesCount = trainingCandles.map(c => c.normalizedTradesCount)

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

    // compute the 2 possible outcomes
    const enterTrade = await brr.readTrade(outcomeEntryTradeIndex)
    const enterPrice = enterTrade.price
    let buyProfitPercent = null
    let sellProfitPercent = null
    let currentTradeIndex = outcomeEntryTradeIndex + 1
    while (currentTradeIndex < brr.info.recordsCount) {
        if ((buyProfitPercent !== null) && (sellProfitPercent !== null)) break
        const trade = await brr.readTrade(currentTradeIndex)
        currentTradeIndex++
        if (buyProfitPercent === null) {
            const profit = trade.price - enterPrice
            const percent = profit / enterPrice
            if ((percent >= 0.007) || (percent <= -0.004)) {
                buyProfitPercent = percent
            }
        }
        if (sellProfitPercent === null) {
            const profit = enterPrice - trade.price
            const percent = profit / enterPrice
            if ((percent >= 0.007) || (percent <= -0.004)) {
                sellProfitPercent = percent
            }
        }
    }

    // Create training sample structure
    return {
        features: {
            candles: {
                opens,
                highs,
                lows,
                closes,
                volumes,
                timestamps,
                colors,
                bodySizes,
                tradesCount
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
                grossProfitTarget: 0.007,
                grossStopLoss: 0.004,
                positionSize: 100,
                fees: 0.002
            }
        },
        outcomes: {
            buyProfit: buyProfitPercent,
            sellProfit: sellProfitPercent
        }
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
const getConfig = () => {
    const result = {
        exchangeName: 'binance',
        symbol: Symbol.find('btcusdc'),
        totalHistoryInDays: 365 * 4,
        candleDurationMinutes: 1,
        candlesPerWindow: 120,
        extraCandlesPerWindowSide: 120
    }

    const brr = BinanceRawReader.create(path.join(path.resolve(__dirname, '..', '..'), 'data', 'binance_btcusdc_trades.bin'), result.symbol)
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
    const candlesGenerator = new CandlesGenerator(null, config.exchangeName, config.symbol, config.candleDurationMinutes)
    const requiredCandlesCount = config.candlesPerWindow + 100
    const safeStartRegion = 50000
    const safeEndRegion = 1000000
    const safeRecordsCount = config.availableDataRange.recordsCount - safeEndRegion - safeStartRegion
    const brr = BinanceRawReader.create(config.availableDataRange.filePath, config.symbol, true)
    for (let i = 0; i < 1000; i++) {
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
        const sample = await createTrainingSample(candles, 120, brr, index)
        console.log(Date.now())
    }
}

const work = async () => {
    const config = getConfig()
    const promises = []
    for (let i = 0; i < 1; i++) {
        promises.push(feed(i, config))
    }
    await Promise.all(promises)
}

work()
