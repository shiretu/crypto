const Csv = require('../utils/Csv')
const { loadConfig, loadNn, createInputs, createOutputs, binaryConverter } = require('./common')
const cliProgress = require('cli-progress')
const fs = require('fs')
const path = require('path')

const work = async () => {
    // Parse command line arguments
    const modelName = process.argv[2] || 'tpn'

    // load the configuration
    const config = await loadConfig(modelName)

    // create the NN
    const nn = await loadNn(config)

    // Setup for inference (disable dropout layers once)
    nn.setupForInference()

    // Use a reasonable subset for evaluation (e.g., last 100k samples or use command line arg)
    const maxSamples = process.argv[3] ? parseInt(process.argv[3]) : 2000
    const totalSamples = Math.min(maxSamples, config.candlesMap.length)

    console.log(`\nEvaluating model on ${totalSamples} samples sequentially (out of ${config.candlesMap.length} total)...\n`)

    // Track statistics
    let correct = 0
    let total = 0
    const confusionMatrix = {
        truePositiveLong: 0, // Predicted [1,0], Actual [1,0]
        falsePositiveLong: 0, // Predicted [1,0], Actual [0,1]
        truePositiveShort: 0, // Predicted [0,1], Actual [0,1]
        falsePositiveShort: 0 // Predicted [0,1], Actual [1,0]
    }

    // Apply winner-takes-all transformation to actual outputs
    const transformActual = config.modelArch.output.binary
        ? binaryConverter
        : (array) => array

    // Delete old predictions.csv if it exists
    if (config.logPredEnabled) {
        const predictionsPath = path.join(config.modelRunFolder, 'predictions.csv')
        if (fs.existsSync(predictionsPath)) {
            fs.unlinkSync(predictionsPath)
        }
    }

    // Create CSV logger for predictions
    const csv = new Csv(config.logPredEnabled ? `${config.modelRunFolder}/predictions.csv` : null, false)

    // Create progress bar
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar.start(totalSamples, 0)

    const start = 1822598 / 2
    for (let i = start; i < start + totalSamples; i++) {
        const inputsInfo = await createInputs(config, i)
        const outputs = await createOutputs(config, inputsInfo.nextTradeIndex)
        const prediction = await nn.predict(inputsInfo.inputs)
        const actual = transformActual(outputs)

        // Check if prediction matches actual
        const isCorrect = prediction[0] === actual[0] && prediction[1] === actual[1]
        if (isCorrect) correct++
        total++

        // Update confusion matrix
        if (prediction[0] === 1 && prediction[1] === 0) {
            // Predicted Long
            if (actual[0] === 1 && actual[1] === 0) {
                confusionMatrix.truePositiveLong++
            } else {
                confusionMatrix.falsePositiveLong++
            }
        } else if (prediction[0] === 0 && prediction[1] === 1) {
            // Predicted Short
            if (actual[0] === 0 && actual[1] === 1) {
                confusionMatrix.truePositiveShort++
            } else {
                confusionMatrix.falsePositiveShort++
            }
        }

        // Log to CSV
        csv.print({ prediction, actual })

        // Update progress bar
        bar.update(i + 1 - start)
    }

    bar.stop()

    // Calculate final metrics
    const accuracy = (correct / total * 100).toFixed(2)
    const invertedAccuracy = ((total - correct) / total * 100).toFixed(2)
    const longPrecision = confusionMatrix.truePositiveLong /
        (confusionMatrix.truePositiveLong + confusionMatrix.falsePositiveLong) * 100
    const shortPrecision = confusionMatrix.truePositiveShort /
        (confusionMatrix.truePositiveShort + confusionMatrix.falsePositiveShort) * 100

    // Calculate inverted metrics
    const invertedLongPrecision = confusionMatrix.falsePositiveShort /
        (confusionMatrix.falsePositiveShort + confusionMatrix.truePositiveShort) * 100
    const invertedShortPrecision = confusionMatrix.falsePositiveLong /
        (confusionMatrix.falsePositiveLong + confusionMatrix.truePositiveLong) * 100

    console.log(`\n${'='.repeat(60)}`)
    console.log('EVALUATION RESULTS - NORMAL')
    console.log('='.repeat(60))
    console.log(`Total Samples: ${total}`)
    console.log(`Correct Predictions: ${correct}`)
    console.log(`Incorrect Predictions: ${total - correct}`)
    console.log(`Overall Accuracy: ${accuracy}%`)
    console.log('\nConfusion Matrix:')
    console.log('  Long Predictions:')
    console.log(`    True Positives (Correct Long):  ${confusionMatrix.truePositiveLong}`)
    console.log(`    False Positives (Wrong Long):   ${confusionMatrix.falsePositiveLong}`)
    console.log(`    Precision: ${longPrecision.toFixed(2)}%`)
    console.log('  Short Predictions:')
    console.log(`    True Positives (Correct Short): ${confusionMatrix.truePositiveShort}`)
    console.log(`    False Positives (Wrong Short):  ${confusionMatrix.falsePositiveShort}`)
    console.log(`    Precision: ${shortPrecision.toFixed(2)}%`)

    console.log(`\n${'='.repeat(60)}`)
    console.log('EVALUATION RESULTS - INVERTED')
    console.log('='.repeat(60))
    console.log(`Total Samples: ${total}`)
    console.log(`Correct Predictions: ${total - correct}`)
    console.log(`Incorrect Predictions: ${correct}`)
    console.log(`Overall Accuracy: ${invertedAccuracy}%`)
    console.log('\nConfusion Matrix (if predictions are flipped):')
    console.log('  Long Predictions (was Short):')
    console.log(`    True Positives (Correct Long):  ${confusionMatrix.falsePositiveShort}`)
    console.log(`    False Positives (Wrong Long):   ${confusionMatrix.truePositiveShort}`)
    console.log(`    Precision: ${invertedLongPrecision.toFixed(2)}%`)
    console.log('  Short Predictions (was Long):')
    console.log(`    True Positives (Correct Short): ${confusionMatrix.falsePositiveLong}`)
    console.log(`    False Positives (Wrong Short):  ${confusionMatrix.truePositiveLong}`)
    console.log(`    Precision: ${invertedShortPrecision.toFixed(2)}%`)
    console.log('='.repeat(60))
}

work()
