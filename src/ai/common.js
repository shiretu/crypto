const path = require('path')
const Symbol = require('../core/Symbol')
const BinanceRawReader = require('../sources/BinanceRawReader')
const CandlesMap = require('../sources/CandlesMap')
const Candle = require('../core/Candle')
const Macd = require('../instruments/macd')

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
    const sample = await _createSample(result)
    result.featuresPerCandle = sample[0].length
    return result
}

const _loadCandles = async (config, firstCandleIndex) => {
    const candlesPreambleCount = 100
    const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount
    if (firstCandleIndex < 0) {
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

const _createSample = async (config) => {
    const candlesInfo = await _loadCandles(config, -1)
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
    return trainingCandles.map((candle, index) => {
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
    })
}

module.exports = {
    loadConfig: _loadConfig,
    loadNn: async (config) => {
        return await require(`./${config.nnType}`).load(config)
    },
    createSample: _createSample
}
