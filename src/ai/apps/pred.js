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
    const all = { count: 0, correct: 0 }
    const perClass = [{ count: 0, correct: 0 }, { count: 0, correct: 0 }, { count: 0, correct: 0 }]

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

        // Calculate accuracy metrics using inference transformation
        const predClass = result.predictedClass // Determined by inference transformation
        const actualClass = result.actual.indexOf(Math.max(...result.actual))

        all.count++
        all.correct += (predClass === actualClass ? 1 : 0)

        perClass[predClass].count++
        perClass[predClass].correct += (predClass === actualClass ? 1 : 0)

        bar.update(i + 1)
    }
    bar.stop()

    // Print accuracy summary
    console.log('\n=== Accuracy Metrics ===')
    console.log(`Total samples: ${all.count.toLocaleString()}`)
    console.log(`Overall accuracy: ${(all.correct / all.count * 100).toFixed(2)}%`)
    console.log('')

    const classNames = ['BUY', 'SELL', 'HOLD']
    classNames.forEach((name, idx) => {
        const classStats = perClass[idx]
        const percentage = (classStats.count / all.count * 100).toFixed(2)
        const accuracy = classStats.count > 0 ? (classStats.correct / classStats.count * 100).toFixed(2) : '0.00'
        console.log(`${name}: ${classStats.count.toLocaleString()} predictions (${percentage}%) - ${accuracy}% accuracy`)
    })

    console.log(`\nPredictions saved to ${csvPath}`)
}

work()
