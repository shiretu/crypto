const { getConfig, createNn, checkCandleContinuity, createTrainingSample } = require('./common')

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
