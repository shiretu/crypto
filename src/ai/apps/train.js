const { loadConfig } = require('../config')
const { createModel } = require('../nns/createModel')
const { progressBar } = require('../sampling/progressBar')
const { randomIndices } = require('../sampling/randomIndices')
const Samples = require('../sampling/Samples')

const work = async () => {
    const config = loadConfig('simple')
    const samples = await Samples.create(config)
    const model = await createModel({ ...config, samplesMetadata: samples.metadata })
    const trainingCount = Math.min(config.train.samplesCount || samples.length, samples.length)
    const randomizedIndices = randomIndices(0, samples.length - 1, trainingCount)
    const bar = progressBar(`Training on ${trainingCount} samples...`)
    bar.start(trainingCount, 0)
    for (let i = 0; i < randomizedIndices.length; i++) {
        const sample = samples.read(randomizedIndices[i])
        await model.train(sample)
        bar.update(i + 1)
    }
    bar.stop()
    console.log(model.summary)
}

work()
