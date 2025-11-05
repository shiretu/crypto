const TradeKind = require('../core/TradeKind')
const { getConfig, createNn, checkCandleContinuity, createTrainingSample } = require('./common')
const console = require('../utils/coloredConsole')

const feed = async (nn, config) => {
    const candlesCount = config.candlesMap.length
    const candlesPreambleCount = 100
    const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount
    for (let i = 0; i < candlesCount - requiredCandlesCount; i++) {
        const candlesInfo = config.candlesMap.bulkGet(config.brr, i, requiredCandlesCount)
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }
        const tradeIndex = candlesInfo.startTradeIndex + candlesInfo.tradesCount
        const sample = await createTrainingSample(candlesInfo.candles, 120, config.brr, tradeIndex, config, { limit: 0 })
        const result = (await nn.pred(sample)).computed
        const predictedTradeKind = result[0] > 0 ? TradeKind.buy : (result[1] > 0 ? TradeKind.sell : TradeKind.hold)
        const predictedPercent = result[0] > 0 ? result[0] : (result[1] > 0 ? result[1] : 0)
        const predicted = {
            kind: predictedTradeKind,
            percent: predictedPercent
        }
        const actualTradeKind = sample.outputs.buyProfitPercent > 0 ? TradeKind.buy : (sample.outputs.sellProfitPercent > 0 ? TradeKind.sell : TradeKind.hold)
        const actualPercent = sample.outputs.buyProfitPercent > 0 ? sample.outputs.buyProfitPercent : (sample.outputs.sellProfitPercent > 0 ? sample.outputs.sellProfitPercent : 0)
        const actual = {
            kind: actualTradeKind,
            percent: actualPercent
        }
        console.log(predicted.kind === actual.kind ? console.GREEN : console.RED, `Predicted: ${predicted.kind} (${predicted.percent.toFixed(5)}%), Actual: ${actual.kind} (${actual.percent.toFixed(5)}%)`)
    }
}

const work = async () => {
    const config = await getConfig(process.argv[2] ?? 'binance_btcusdc')
    const nn = await createNn(config)
    await feed(nn, config)
}

work()
