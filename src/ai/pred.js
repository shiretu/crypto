const Csv = require('../utils/Csv')
const { loadConfig, loadNn, createInputs, createOutputs, binaryConverter } = require('./common')
const cliProgress = require('cli-progress')
const fs = require('fs')
const path = require('path')

const work = async () => {
    // Parse command line arguments
    const modelName = process.argv[2] || 'simple-binary'

    // load the configuration
    const config = await loadConfig(modelName)

    // create the NN
    const nn = await loadNn(config)

    // Setup for inference (disable dropout layers once)
    nn.setupForInference()

    // Apply winner-takes-all transformation to actual outputs
    const outputConverter = config.modelArch.output.binary
        ? binaryConverter
        : (array) => array

    // establish the limits
    const dayLengthUs = 24 * 3600 * 1000000
    const lastCandle = config.candlesMap.get(config.tradesReader, config.candlesMap.length - 1).candle
    const predStartTimeUs = lastCandle.tsUs.open + config.predStartTimeDays * dayLengthUs
    const predEndTimeUs = predStartTimeUs + config.predDurationDays * dayLengthUs
    const startCandleIndex = config.candlesMap.findIndex(config.tradesReader, c => { return c.tsUs.open - predStartTimeUs })
    const endCandleIndex = config.candlesMap.findIndex(config.tradesReader, c => { return c.tsUs.open - predEndTimeUs })
    const startCandle = config.candlesMap.get(config.tradesReader, startCandleIndex).candle
    const endCandle = config.candlesMap.get(config.tradesReader, endCandleIndex).candle
    const totalSamples = endCandleIndex - startCandleIndex
    console.log('Prediction Start Candle Index: ', startCandleIndex, '; Time: ', new Date(startCandle.tsUs.open / 1000))
    console.log('Prediction End Candle Index  : ', endCandleIndex, '; Time: ', new Date(endCandle.tsUs.open / 1000))
    console.log('Total Samples to Predict     : ', totalSamples)

    // Create progress bar
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar.start(totalSamples, 0)

    // Delete old predictions.csv if it exists
    if (config.logPredEnabled) {
        const predictionsPath = path.join(config.modelRunFolder, 'predictions.csv')
        if (fs.existsSync(predictionsPath)) {
            fs.unlinkSync(predictionsPath)
        }
    }

    // Create CSV logger for predictions
    const csv = new Csv(config.logPredEnabled ? `${config.modelRunFolder}/predictions.csv` : null, false)

    const stats = {
        buyWins: 0,
        buyLosses: 0,
        sellWins: 0,
        sellLosses: 0,
        holds: 0,
        errors: 0
    }

    for (let i = startCandleIndex; i < endCandleIndex; i++) {
        const inputsInfo = await createInputs(config, i)
        const actual = outputConverter(await createOutputs(config, inputsInfo.nextTradeIndex))
        const predictionResult = await nn.predict(inputsInfo.inputs)

        // Use nominalOutput for comparison and statistics
        const prediction = predictionResult.nominalOutput

        const isError = (prediction[0] === 1) && (prediction[1] === 1)
        csv.print({
            originalOutput: predictionResult.originalOutput,
            prediction,
            actual,
            isError
        })
        if (isError) {
            stats.errors += 1
            continue
        }

        const isHold = (prediction[0] === 0) && (prediction[1] === 0)
        if (isHold) {
            stats.holds += 1
            continue
        }

        stats.buyWins += ((prediction[0] === actual[0]) && (prediction[0] === 1)) ? 1 : 0
        stats.buyLosses += ((prediction[0] !== actual[0]) && (prediction[0] === 1)) ? 1 : 0
        stats.sellWins += ((prediction[1] === actual[1]) && (prediction[1] === 1)) ? 1 : 0
        stats.sellLosses += ((prediction[1] !== actual[1]) && (prediction[1] === 1)) ? 1 : 0

        // Update progress bar
        bar.update(i + 1 - startCandleIndex)
    }

    bar.stop()

    stats.buyWinRate = stats.buyWins / (stats.buyWins + stats.buyLosses)
    stats.sellWinRate = stats.sellWins / (stats.sellWins + stats.sellLosses)
    stats.winRate = (stats.buyWins + stats.sellWins) / (stats.buyWins + stats.buyLosses + stats.sellWins + stats.sellLosses)
    stats.holdRate = stats.holds / (stats.buyWins + stats.buyLosses + stats.sellWins + stats.sellLosses + stats.holds)

    // display stats
    const line = '='.repeat(40)
    console.log(line)
    console.log('PREDICTION RESULTS')
    console.log(line)
    console.log(`         Buy Wins: ${stats.buyWins}`)
    console.log(`       Buy Losses: ${stats.buyLosses}`)
    console.log(`     Buy Win Rate: ${(stats.buyWinRate * 100).toFixed(2)}%`)
    console.log(line)
    console.log(`        Sell Wins: ${stats.sellWins}`)
    console.log(`      Sell Losses: ${stats.sellLosses}`)
    console.log(`    Sell Win Rate: ${(stats.sellWinRate * 100).toFixed(2)}%`)
    console.log(line)
    console.log(`Total Predictions: ${totalSamples}`)
    console.log(` Overall Win Rate: ${(stats.winRate * 100).toFixed(2)}%`)
    console.log(`        Hold Rate: ${(stats.holdRate * 100).toFixed(2)}%`)
    console.log(line)
    console.log(`            Holds: ${stats.holds}`)
    console.log(`           Errors: ${stats.errors}`)
    console.log(line)
}

work()
