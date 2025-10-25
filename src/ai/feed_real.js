const { EventEmitter } = require('events')
const Symbol = require('../core/Symbol')
const Candle = require('../core/Candle')
const { getSource } = require('../sources/sources')
const CandlesGenerator = require('../core/CandlesGenerator')
const EventName = require('../core/EventName')
const Macd = require('../instruments/macd')

/**
 * Create a training sample from 120 candles
 * @param {Candle[]} candles - Array of 120 candles
 * @returns {object} Training sample with features and outcomes
 */
const createTrainingSample = (candles, start, length) => {
    // Extract the training candles
    const trainingCandles = candles.slice(start, start + length)

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
    candles.forEach((candle, index) => {
        macdComputer.push(candle.close.normalizedPrice)
        if (index >= start && index < start + length) {
            macd.push(macdComputer.value)
        }
    })

    // compute the 2 possible outcomes
    const trades = candles.slice(start + length).map(c => c.trades).flat()
    const enterPrice = trades[0].normalizedPrice
    let buyProfit = null
    let sellProfit = null
    const future = trades.slice(1)
    for (const trade of future) {
        if ((buyProfit !== null) && (sellProfit !== null)) break
        if (buyProfit === null) {
            const profit = trade.normalizedPrice - enterPrice
            const percent = profit / enterPrice
            if ((percent >= 0.007) || (percent <= -0.004)) {
                buyProfit = profit
            }
        }
        if (sellProfit === null) {
            const profit = enterPrice - trade.normalizedPrice
            const percent = profit / enterPrice
            if ((percent >= 0.007) || (percent <= -0.004)) {
                sellProfit = profit
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
                windowSize: length,
                grossProfitTarget: 0.007,
                grossStopLoss: 0.004,
                positionSize: 100,
                fees: 0.002
            }
        },
        outcomes: {
            buyProfit,
            sellProfit
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

const work = async () => {
    const exchangeName = 'binance'
    const symbolName = 'btcusdc'
    const candleDurationMinutes = 1
    const candlesPerWindow = 120
    const extraCandlesPerWindowSide = 120

    const events = new EventEmitter()
    const symbol = Symbol.find(symbolName)

    const source = await getSource(events, exchangeName, symbol, 365 * 4)
    console.log('Source initialized: ', source)

    const candlesGenerator = new CandlesGenerator(events, exchangeName, symbol, candleDurationMinutes)
    console.log('CandlesGenerator initialized: ', candlesGenerator)

    /**
     * @type {{ minTsUs: number, maxTsUs: number, durationUs: number }}
     */
    const availableDataRange = await source.getAvailableDataRangeUs()
    availableDataRange.durationUs = availableDataRange.maxTsUs - availableDataRange.minTsUs
    console.log(`Available data range: ${new Date(availableDataRange.minTsUs / 1000).toISOString()} -> ${new Date(availableDataRange.maxTsUs / 1000).toISOString()}: ${Math.floor(availableDataRange.durationUs / (1000000.0 * 60 * 60 * 24))} days`)

    let candles = []
    events.on(EventName.ofCandle(EventName.ACTION.CLOSED, exchangeName, symbol.id), (/** @type {Candle} */ candle) => {
        candles.push(candle)
    })

    const totalCandlesCount = candlesPerWindow + (3 * extraCandlesPerWindowSide)
    let validWindowsFound = 0
    while (validWindowsFound < 10) {
        const windowStartUs = Math.floor(Math.random() * availableDataRange.durationUs) + availableDataRange.minTsUs
        candles = []
        candlesGenerator.reset()
        await source.run(windowStartUs / 1000, () => candles.length < totalCandlesCount)

        // do we have all required candles?
        if (candles.length < totalCandlesCount) {
            console.log(`Window starting at ${new Date(windowStartUs / 1000).toISOString()} rejected due to insufficient candles: got ${candles.length}, expected ${totalCandlesCount}.`)
            continue
        }

        // chop first and last candles, they might be incomplete
        candles = candles.slice(1, candles.length - 1)

        // are the candles continuous?
        if (!checkCandleContinuity(candles)) {
            // console.log(`Window starting at ${new Date(windowStartUs / 1000).toISOString()} rejected due to candle gaps.`)
            continue
        }
        validWindowsFound++
        console.log(`Window starting at ${new Date(windowStartUs / 1000).toISOString()} accepted with ${candles.length} continuous candles.`)

        // Create training sample from the middle 120 candles
        const trainingSample = createTrainingSample(candles, 119, 120)
        console.log(trainingSample.features.candles.timestamps)
        // console.log('Training sample created:', {
        //     candleCount: trainingCandles.length,
        //     firstCandle: new Date(trainingCandles[0].tsUs.open / 1000).toISOString(),
        //     lastCandle: new Date(trainingCandles[trainingCandles.length - 1].tsUs.close / 1000).toISOString(),
        //     sampleKeys: Object.keys(trainingSample),
        //     featuresKeys: Object.keys(trainingSample.features),
        //     candleFeatureCount: Object.keys(trainingSample.features.candles).length
        // })
    }
}

work()
