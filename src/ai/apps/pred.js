const Csv = require('../../utils/Csv')
const { loadConfig } = require('../config')
const { createModel } = require('../nns/createModel')
const paths = require('../common/paths')
const { progressBar } = require('../common/progressBar')
const Samples = require('../common/Samples')

const work = async () => {
    // prepare the data and the model
    const config = loadConfig('simple')
    const samples = await Samples.create(config)
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

    // do the damage
    for (let i = 0; i < predictionCount; i++) {
        const sample = samples.read(i)
        const prediction = await model.inference(sample)

        // Log prediction along with actual output
        const outputs = sample.outputs
        csv.print({
            sampleIndex: i,
            pred_0: prediction[0],
            pred_1: prediction[1],
            actual_0: outputs[0].confidence,
            actual_1: outputs[1].confidence
        })

        bar.update(i + 1)
    }
    bar.stop()

    console.log(`Predictions saved to ${csvPath}`)
}

work()
