const path = require('path')
const Symbol = require('../core/Symbol')
const BinanceRawReader = require('../sources/BinanceRawReader')
const CandlesMap = require('../sources/CandlesMap')
const Candle = require('../core/Candle')
const Macd = require('../instruments/macd')
const TradeKind = require('../core/TradeKind')
const Trade = require('../core/Trade')
const Order = require('../core/Order')
const Csv = require('../utils/Csv')
const fs = require('fs').promises
const cliProgress = require('cli-progress')

const _loadConfig = async (modelName) => {
    const result = { modelName }
    result.rootFolder = path.resolve(__dirname, '../../')
    result.modelsFolder = path.resolve(result.rootFolder, 'models')
    result.modelFolder = path.join(result.modelsFolder, modelName)
    result.modelConfigPath = path.join(result.modelFolder, 'config.json')
    result.modelArchPath = path.join(result.modelFolder, 'arch.json')
    result.dataFolder = path.resolve(result.rootFolder, 'data')
    Object.entries(require(result.modelConfigPath)).forEach(([k, v]) => { result[k] = v })
    result.symbol = Symbol.find(result.symbol)
    result.tradesDataPath = path.join(result.dataFolder, `${result.exchangeName}_${result.symbol.id}_trades.bin`)
    result.tradesReader = BinanceRawReader.create(result.tradesDataPath, result.symbol)
    result.candlesMap = await CandlesMap.create(result)
    result.modelArch = require(result.modelArchPath)
    const inputsInfo = await _createInputs(result)
    result.featuresPerCandle = inputsInfo.inputs[0].length

    if (result.usePregeneratedSamples) {
        const particles = [
            result.exchangeName,
            result.symbol.id,
            result.candlesPreambleCount,
            result.candlesPerWindow,
            result.normalizeAroundZero,
            result.normalizationFactor,
            result.featuresPerCandle,
            (await _createOutputs(result, (await _createInputs(result)).nextTradeIndex)).length
        ]
        result.pregeneratedSamplesDataPath = path.join(result.dataFolder, `pregenerated_${particles.join('_')}.bin`)
    }

    return result
}

const _loadCandles = async (config, firstCandleIndex) => {
    const requiredCandlesCount = config.candlesPerWindow + config.candlesPreambleCount
    if ((firstCandleIndex === undefined) || (firstCandleIndex < 0)) {
        firstCandleIndex = Math.floor(Math.random() * (config.candlesMap.length - requiredCandlesCount))
    }
    const result = config.candlesMap.bulkGet(
        config.tradesReader,
        firstCandleIndex,
        requiredCandlesCount
    )

    result.nextTradeIndex = result.firstCandleIndex + result.tradesCount

    return result
}

const _createInputs = async (config, firstCandleIndex) => {
    const candlesInfo = await _loadCandles(config, firstCandleIndex)
    // normalize the candles
    Candle.normalize(candlesInfo.candles, config.normalizeAroundZero, config.normalizationFactor)

    // Extract the training candles
    const trainingCandles = candlesInfo.candles.slice(-1 * config.candlesPerWindow)

    // signals computations
    const macdComputer = new Macd()
    const macd = []
    const start = candlesInfo.candles.length - config.candlesPerWindow
    candlesInfo.candles.forEach((candle, index) => {
        macdComputer.push(candle.close.normalizedPrice)
        if (index >= start && index < start + config.candlesPerWindow) {
            macd.push(macdComputer.value)
        }
    })

    // we will return an array of arrays.
    // each inner array is having all candle and study features for one candle
    return {
        inputs: trainingCandles.map((candle, index) => {
            return [
                candle.open.normalizedPrice,
                candle.high.normalizedPrice,
                candle.low.normalizedPrice,
                candle.close.normalizedPrice,
                candle.normalizedQuoteVolume,
                candle.normalizedMinuteOfDay,
                candle.direction,
                candle.normalizedHeight,
                candle.normalizedTradesCount,
                new Date(candle.tsUs.open / 1000).getDay(),
                macd[index].short,
                macd[index].long,
                macd[index].macd,
                macd[index].signal,
                macd[index].histogram
            ]
        }),
        nextTradeIndex: candlesInfo.nextTradeIndex,
        firstCandleIndex: candlesInfo.firstCandleIndex
    }
}

const _createOutputs = async (config, fromTradeIndex) => {
    const maxHoldingTimeUs = config.maxHoldingTimeSec * 1000000
    const firstTrade = await config.tradesReader.readTrade(fromTradeIndex)
    const buyOrder = Order.create(TradeKind.buy, config.stopLossPercent, config.takeProfitPercent)
    const sellOrder = Order.create(TradeKind.sell, config.stopLossPercent, config.takeProfitPercent)

    let lastGoodTradeTsUs = firstTrade.tsUs + maxHoldingTimeUs
    for (let i = fromTradeIndex; i < config.tradesReader.info.recordsCount; i++) {
        const trade = await config.tradesReader.readTrade(i)
        if ((trade.tsUs - firstTrade.tsUs) >= maxHoldingTimeUs) break
        lastGoodTradeTsUs = trade.tsUs
        buyOrder.pushTrade(trade)
        sellOrder.pushTrade(trade)
        if (buyOrder.isClosed && sellOrder.isClosed) break
    }

    const process = (order) => {
        // Handle orders that never got entered
        if (!order.enter || !order.last) return 0

        // Calculate confidence based on how quickly the order closed/reached current time
        const timeRatio = order.isClosed
            ? (order.ageUs / maxHoldingTimeUs)
            : ((lastGoodTradeTsUs - firstTrade.tsUs) / maxHoldingTimeUs)
        const confidence = Math.floor((1 - timeRatio) * 1000) / 1000

        // Determine direction based on outcome
        const direction = (() => {
            // Closed orders: use whether stop-loss or take-profit was hit
            if (order.isClosed) { return order.isStopLossHit ? -1 : 1 }

            // Open orders: use the sign of unrealized profit
            return order.profitPercent >= 0 ? 1 : -1
        })()

        return confidence * direction
    }

    return [process(buyOrder), process(sellOrder)]
}

const _loadPregenerated = async (config) => {
    if (!await fs.access(config.pregeneratedSamplesDataPath).then(() => true).catch(() => false)) {
        return null
    }
    const recordSize = 2 + (config.candlesPerWindow * config.featuresPerCandle) + 2
    const buf = await fs.readFile(config.pregeneratedSamplesDataPath)
    const raw = new Float64Array(buf.buffer, buf.byteOffset, buf.length / 8)
    if ((raw.length % recordSize) !== 0) {
        throw new Error('Pregenerated data size is not aligned with record size')
    }
    const recordsCount = raw.length / recordSize
    const result = []
    console.log(`Loading ${recordsCount} samples...`)
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar.start(recordsCount, 0)
    for (let i = 0; i < recordsCount; i++) {
        result.push({
            firstCandleIndex: raw[i * recordSize],
            nextTradeIndex: raw[i * recordSize + 1],
            inputs: Array.from({ length: config.candlesPerWindow }, (_, t) =>
                Array.from({ length: config.featuresPerCandle }, (_, f) =>
                    raw[i * recordSize + 2 + t * config.featuresPerCandle + f]
                )
            ),
            outputs: [
                raw[i * recordSize + 2 + (config.candlesPerWindow * config.featuresPerCandle)],
                raw[i * recordSize + 2 + (config.candlesPerWindow * config.featuresPerCandle) + 1]
            ]
        })
        bar.update(i + 1)
    }
    bar.stop()
    return result
}

module.exports = {
    loadConfig: _loadConfig,
    loadNn: async (config) => {
        return await require(`./${config.nnType}`).load(config)
    },
    createInputs: _createInputs,
    createOutputs: _createOutputs,
    loadPregenerated: _loadPregenerated,
    outputTransformations: {
        none: (array) => array,
        singleLabel: (array) => {
            const threshold = 0.5
            const normalized = array.map(v => v >= threshold ? v : 0)
            const max = Math.max(...normalized)
            if (max === 0) return array.map(() => 0)
            const maxIndex = normalized.findIndex(v => v === max)
            return normalized.map((_, i) => i === maxIndex ? 1 : 0)
        },
        multiLabel: (array) => {
            const threshold = 0.5
            return array.map(v => v >= threshold ? 1 : 0)
        }
    }
}
