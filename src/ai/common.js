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

const _createInputs = async (config) => {
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
        nextTradeIndex: candlesInfo.nextTradeIndex
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
        const result = Math.floor((1 - (order.isClosed ? (order.ageUs / maxHoldingTimeUs) : (lastGoodTradeTsUs - firstTrade.tsUs) / maxHoldingTimeUs)) * 100) / 100
        return result * (order.isStopLossHit ? -1 : 1)
    }

    return [process(buyOrder), process(sellOrder)]
}

module.exports = {
    loadConfig: _loadConfig,
    loadNn: async (config) => {
        return await require(`./${config.nnType}`).load(config)
    },
    createInputs: _createInputs,
    createOutputs: _createOutputs
}
