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
            } else if (typeof v === 'string') {
                return `"${v.replace(/"/g, '""')}"`
            } else {
                return v
            }
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
    let sampleBatch = []

    while (true) {
        if (config.autosaveIntervalSeconds) {
            const now = Date.now()
            if (now - lastSavedAt >= config.autosaveIntervalSeconds * 1000) {
                await nn.save()
                lastSavedAt = now
            }
        }

        const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount
        const randomStartIndex = Math.floor(Math.random() * (candlesCount - requiredCandlesCount))
        const candlesInfo = config.candlesMap.bulkGet(
            config.brr,
            randomStartIndex,
            requiredCandlesCount
        )
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }
        const tradeIndex = candlesInfo.startTradeIndex + candlesInfo.tradesCount
        const sample = await createTrainingSample(candlesInfo.candles, tradeIndex, config, pastSimulationsTimeouts)

        // Skip samples with null outcomes
        if (sample === null) { continue }

        // Add to batch
        sampleBatch.push({ sample, randomStartIndex, candlesInfo, tradeIndex })

        // Train when batch is full
        if (sampleBatch.length >= config.trainBatchSize) {
            i++
            // Get predictions BEFORE training for all samples in batch
            const predictions = []
            for (const item of sampleBatch) {
                const pred = await nn.pred(item.sample)
                predictions.push(pred)
            }

            const trainResult = await nn.train(sampleBatch.map(s => s.sample))

            // Collect all predicted and actual values
            const predictedBuys = predictions.map(p => p.percentages.buy.toFixed(10)).join(':')
            const predictedSells = predictions.map(p => p.percentages.sell.toFixed(10)).join(':')
            const actualBuys = sampleBatch.map(s => s.sample.outputs.buyProfitPercent.toFixed(10)).join(':')
            const actualSells = sampleBatch.map(s => s.sample.outputs.sellProfitPercent.toFixed(10)).join(':')

            // Log the first sample in the batch with all predictions
            const firstItem = sampleBatch[0]
            printCsv({
                SampleIndex: i,
                StartCandleIndex: firstItem.randomStartIndex,
                StartCandleId: firstItem.candlesInfo.candles[0].id,
                TradeIndex: firstItem.tradeIndex,
                Loss: trainResult.history.loss[0],
                MAE: trainResult.history.mae[0],
                MSE: trainResult.history.mse[0],
                BuyOrderDuration: firstItem.sample.buyOrder.durationUs,
                BuyOrderForcedClose: firstItem.sample.buyOrder.forceClose,
                BuyOrderTradesCount: firstItem.sample.buyOrder.tradesCount,
                SellOrderDuration: firstItem.sample.sellOrder.durationUs,
                SellOrderForcedClose: firstItem.sample.sellOrder.forceClose,
                SellOrderTradesCount: firstItem.sample.sellOrder.tradesCount,
                PredictedBuys: predictedBuys,
                PredictedSells: predictedSells,
                ActualBuys: actualBuys,
                ActualSells: actualSells
            })

            sampleBatch = []
        }
    }
}

const work = async () => {
    const config = await getConfig(process.argv[2] ?? 'binance_btcusdc')
    const nn = await createNn(config)
    await feed(nn, config)
}

work()
