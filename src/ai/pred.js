const { getConfig, createNn, checkCandleContinuity, createTrainingSample } = require('./common')
const console = require('../utils/coloredConsole')
const { postProcessPrediction } = require('./postProcessPrediction')

const feed = async (nn, config) => {
    const candlesCount = config.candlesMap.length
    const candlesPreambleCount = 100
    const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount
    for (let i = 0; i < candlesCount - requiredCandlesCount; i++) {
        const candlesInfo = config.candlesMap.bulkGet(config.brr, i, requiredCandlesCount)
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }
        const tradeIndex = candlesInfo.startTradeIndex + candlesInfo.tradesCount
        const sample = await createTrainingSample(candlesInfo.candles, 120, config.brr, tradeIndex, config, { limit: 0 })
        const predicted = await nn.pred(sample)
        const actual = postProcessPrediction(sample.outputs.buyProfitPercent, sample.outputs.sellProfitPercent)
        console.log(predicted.kind === actual.kind ? console.GREEN : console.RED, `Predicted: ${predicted.kind} (${predicted.percent.toFixed(5)}%), Actual: ${actual.kind} (${actual.percent.toFixed(5)}%) - ${predicted.percentages.buy}, ${predicted.percentages.sell}`)
    }
}

const work = async () => {
    const config = await getConfig(process.argv[2] ?? 'binance_btcusdc')
    const nn = await createNn(config)
    await feed(nn, config)
}

work()
