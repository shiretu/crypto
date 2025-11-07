const { getConfig, createNn, checkCandleContinuity, createTrainingSample, loadCandles } = require('./common')

/**
 * Feed data for training
 * @param {*} nn
 * @param {*} config
 */
const feed = async (nn, config) => {
    const fs = require('fs')
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
    let trainingIndex = 0
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

        // load the candles
        const candlesInfo = await loadCandles(config, -1)
        if (!checkCandleContinuity(candlesInfo.candles)) { continue }

        // create the sample
        const sample = await createTrainingSample(candlesInfo.candles, candlesInfo.nextTradeIndex, config, pastSimulationsTimeouts)

        // Skip samples with null outcomes
        if (sample === null) { continue }

        // Add to batch
        sampleBatch.push({ sample, candlesInfo })

        // wait for the entire batch to get full
        if (sampleBatch.length < config.trainBatchSize) continue

        // okay, bump the training index and start training
        trainingIndex++
        const trainResult = await nn.train(sampleBatch.map(s => s.sample))

        // Log the first sample in the batch with all predictions
        printCsv({
            trainingIndex,
            loss: trainResult.history.loss[0],
            mae: trainResult.history.mae[0],
            mse: trainResult.history.mse[0]
        })

        sampleBatch = []
    }
}

const work = async () => {
    const config = await getConfig(process.argv[2] ?? 'binance_btcusdc')
    const nn = await createNn(config)
    await feed(nn, config)
}

work()
