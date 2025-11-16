const Csv = require('../../utils/Csv')
const { cache } = require('../common/Cache')
const paths = require('../common/paths')
const { progressBar } = require('../common/progressBar')
const { loadConfig } = require('../config')
const { createModel } = require('../nns/createModel')

const work = async () => {
    // prepare the data and the model
    const config = loadConfig('simple')
    const samples = await cache.samples(config)
    const model = await createModel({ ...config, samplesMetadata: samples.metadata })
    console.log(model.summary.initModel)

    // prepare logging
    const csvPath = paths.modelPredLog(config)
    const fs = require('fs')
    if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath)
    }
    const csv = new Csv(csvPath, false)

    // setup the loop
    const predictionCount = Math.min(config.train.samplesCount || samples.length, samples.length)
    const bar = progressBar(`Running inference on ${predictionCount} samples...`, !csv.consoleOutput)
    bar.start(predictionCount, 0)

    // accuracy tracking
    const stats = {
        total: 0,
        correctClass: 0,
        strongPredictions: 0,
        strongCorrect: 0
    }

    // do the damage
    for (let i = 0; i < predictionCount; i++) {
        const sample = samples.read(i)
        const result = await model.inference(sample)

        // Log prediction along with actual output
        const outputs = sample.outputs
        csv.print({
            sampleIndex: i,
            pred: result.prediction,
            actual: outputs.map(output => output.confidence)
        })

        // Calculate accuracy metrics
        const prediction = result.prediction // [buy_prob, sell_prob, hold_prob]
        const actual = result.actual // [buy_label, sell_label, hold_label] after transformation

        // Find predicted and actual classes
        const predClass = prediction.indexOf(Math.max(...prediction))
        const actualClass = actual.indexOf(Math.max(...actual))

        stats.total++
        if (predClass === actualClass) {
            stats.correctClass++
        }

        // Track strong predictions (max probability > 0.5)
        const maxPredProb = Math.max(...prediction)
        if (maxPredProb > 0.5) {
            stats.strongPredictions++
            if (predClass === actualClass) {
                stats.strongCorrect++
            }
        }

        bar.update(i + 1)
    }
    bar.stop()

    // Print accuracy summary
    console.log('\n=== Accuracy Metrics ===')
    console.log(`Total samples: ${stats.total.toLocaleString()}`)
    console.log(`Overall accuracy: ${(stats.correctClass / stats.total * 100).toFixed(2)}%`)
    console.log(`Strong predictions (prob > 0.5): ${stats.strongPredictions.toLocaleString()} (${(stats.strongPredictions / stats.total * 100).toFixed(2)}%)`)
    if (stats.strongPredictions > 0) {
        console.log(`Strong prediction accuracy: ${(stats.strongCorrect / stats.strongPredictions * 100).toFixed(2)}%`)
    }

    console.log(`\nPredictions saved to ${csvPath}`)
}

work()
