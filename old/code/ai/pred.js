const { getConfig, createNn, checkCandleContinuity, createTrainingSample, loadCandles } = require('./common')
const console = require('../utils/coloredConsole')
const { postProcessPrediction } = require('./postProcessPrediction')
const fs = require('fs')
const path = require('path')
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
            fs.mkdirSync(path.dirname(config.predLogPath), { recursive: true })
            const headers = Object.keys(data).join(',')
            fs.writeFileSync(config.predLogPath, headers + '\n')
        }
        printCsvWithoutColumns(data)
        printCsv = printCsvWithoutColumns
    }
    printCsv = printCsvWithColumns

    const maxIndex = candlesCount - requiredCandlesCount
    console.log(`Starting infinite random predictions (max index: ${maxIndex})...`)

    let predictionIndex = 0
    let wins = 0
    let losses = 0
    while (true) {
        const candlesInfo = await loadCandles(config, -1)
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }
        const sample = await createTrainingSample(candlesInfo.candles, candlesInfo.nextTradeIndex, config, { limit: 0 })
        if (sample === null) { continue }

        predictionIndex++
        const predicted = await nn.pred(sample)
        const actual = postProcessPrediction(sample.outputs.buyProfitPercent, sample.outputs.sellProfitPercent)
        if (predicted.kind !== TradeKind.hold) {
            wins += predicted.kind === actual.kind ? 1 : 0
            losses += predicted.kind !== actual.kind ? 1 : 0
        }
        const color = predicted.kind === actual.kind ? console.GREEN : console.RED
        const pKind = predicted.kind.key || String(predicted.kind)
        const aKind = actual.kind.key || String(actual.kind)

        console.log(color, `P: ${pKind.padEnd(4)} (${predicted.percentages.buy.toFixed(3)}%, ${predicted.percentages.sell.toFixed(3)}%); A: ${aKind.padEnd(4)} (${actual.percentages.buy.toFixed(3)}%, ${actual.percentages.sell.toFixed(3)}%); W/L: ${wins}/${losses} = ${(wins / (wins + losses) * 100).toFixed(2)}%`)

        printCsv({
            predictionIndex,
            firstCandleIndex: candlesInfo.firstCandleIndex,
            nextTradeIndex: candlesInfo.nextTradeIndex,
            PredictedKind: pKind,
            PredictedPercent: predicted.percent,
            PredictedBuy: predicted.percentages.buy,
            PredictedSell: predicted.percentages.sell,
            ActualKind: aKind,
            ActualPercent: actual.percent,
            ActualBuy: actual.percentages.buy,
            ActualSell: actual.percentages.sell,
            Correct: predicted.kind === actual.kind ? 1 : 0,
            Wins: wins,
            Losses: losses,
            WinRate: wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(2) : 0
        })
    }
}

const work = async () => {
    const config = await getConfig(process.argv[2] ?? 'binance_btcusdc')
    const nn = await createNn(config)
    await feed(nn, config)
}

work()
