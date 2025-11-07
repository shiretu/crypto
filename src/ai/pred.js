const { getConfig, createNn, checkCandleContinuity, createTrainingSample } = require('./common')
const console = require('../utils/coloredConsole')
const { postProcessPrediction } = require('./postProcessPrediction')
const fs = require('fs')
const TradeKind = require('../core/TradeKind')

const feed = async (nn, config) => {
    const candlesCount = config.candlesMap.length
    const candlesPreambleCount = 100
    const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount

    let printCsv = null
    const printCsvWithoutColumns = (data) => {
        const line = Object.values(data).map(v => {
            if (typeof v === 'number') {
                return Number.isInteger(v) ? v.toString() : v.toFixed(10)
            }
            return v
        }).join(',')
        fs.appendFileSync(config.predLogPath, line + '\n')
    }
    const printCsvWithColumns = (data) => {
        if (!fs.existsSync(config.predLogPath)) {
            const headers = Object.keys(data).join(',')
            fs.writeFileSync(config.predLogPath, headers + '\n')
        }
        printCsvWithoutColumns(data)
        printCsv = printCsvWithoutColumns
    }
    printCsv = printCsvWithColumns

    // Generate random indices for sampling
    const maxIndex = candlesCount - requiredCandlesCount
    const sampleCount = Math.min(1000, maxIndex) // Limit to 1000 random samples
    const randomIndices = []
    while (randomIndices.length < sampleCount) {
        const randomIndex = Math.floor(Math.random() * maxIndex)
        if (!randomIndices.includes(randomIndex)) {
            randomIndices.push(randomIndex)
        }
    }
    console.log(`Testing on ${sampleCount} random samples from dataset...`)

    let sampleIndex = 0
    for (const i of randomIndices) {
        const candlesInfo = config.candlesMap.bulkGet(config.brr, i, requiredCandlesCount)
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }
        const tradeIndex = candlesInfo.startTradeIndex + candlesInfo.tradesCount
        const sample = await createTrainingSample(candlesInfo.candles, 120, config.brr, tradeIndex, config, { limit: 0 })
        if (sample === null) { continue }

        sampleIndex++
        const predicted = await nn.pred(sample)
        const actual = postProcessPrediction(sample.outputs.buyProfitPercent, sample.outputs.sellProfitPercent)
        const color = predicted.kind === actual.kind ? console.GREEN : console.RED
        const pKind = predicted.kind.key || String(predicted.kind)
        const aKind = actual.kind.key || String(actual.kind)

        // if (predicted.kind !== TradeKind.hold) {
        console.log(color, `P: ${pKind.padEnd(4)} (${predicted.percentages.buy.toFixed(3)}%, ${predicted.percentages.sell.toFixed(3)}%); A: ${aKind.padEnd(4)} (${actual.percentages.buy.toFixed(3)}%, ${actual.percentages.sell.toFixed(3)}%)`)
        // }

        printCsv({
            SampleIndex: sampleIndex,
            CandleIndex: i,
            CandleId: candlesInfo.candles[0].id,
            TradeIndex: tradeIndex,
            PredictedKind: pKind,
            PredictedPercent: predicted.percent,
            PredictedBuy: predicted.percentages.buy,
            PredictedSell: predicted.percentages.sell,
            ActualKind: aKind,
            ActualPercent: actual.percent,
            ActualBuy: actual.percentages.buy,
            ActualSell: actual.percentages.sell,
            Correct: predicted.kind === actual.kind ? 1 : 0
        })
    }
}

const work = async () => {
    const config = await getConfig(process.argv[2] ?? 'binance_btcusdc')
    const nn = await createNn(config)
    await feed(nn, config)
}

work()
