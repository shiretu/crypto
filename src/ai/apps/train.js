const Csv = require('../../utils/Csv')
const Samples = require('../common/Samples')
const paths = require('../common/paths')
const { progressBar } = require('../common/progressBar')
const { randomIndices } = require('../common/randomIndices')
const { loadConfig } = require('../config')
const { createModel } = require('../nns/createModel')

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

    // prepare time tracking for saving the model every minute
    let lastSavedTime = Date.now()

    // do the damage
    for (let i = 0; i < randomizedIndices.length; i++) {
        // autosave the model at intervals
        const now = Date.now()
        if ((now - lastSavedTime) >= 60 * 1000) {
            await model.save()
            lastSavedTime = now
        }

        // read and train
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

    // final save
    await model.save()
}

work()
