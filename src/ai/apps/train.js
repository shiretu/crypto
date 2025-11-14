const Csv = require('../../utils/Csv')
const { loadConfig } = require('../config')
const { createModel } = require('../nns/createModel')
const paths = require('../sampling/paths')
const { progressBar } = require('../sampling/progressBar')
const { randomIndices } = require('../sampling/randomIndices')
const Samples = require('../sampling/Samples')

const work = async () => {
    // prepare the data and the model
    const config = loadConfig('simple')
    const samples = await Samples.create(config)
    const model = await createModel({ ...config, samplesMetadata: samples.metadata })
    console.log(model.summary.initModel)

    // prepare logging
    const csvPath = paths.modelTrainLog(config)
    const fs = require('fs')
    if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath)
    }
    const csv = new Csv(csvPath, false)

    // setup the loop
    const trainingCount = Math.min(config.train.samplesCount || samples.length, samples.length)
    const randomizedIndices = randomIndices(0, samples.length - 1, trainingCount)
    const bar = progressBar(`Training on ${trainingCount} samples...`, !csv.consoleOutput)
    bar.start(trainingCount, 0)

    // do the damage
    for (let i = 0; i < randomizedIndices.length; i++) {
        const sample = samples.read(randomizedIndices[i])
        const res = await model.train(sample)
        if (res) {
            csv.print({
                sampleIndex: randomizedIndices[i],
                ...res
            })
        }
        bar.update(i + 1)
    }
    bar.stop()
}

work()
