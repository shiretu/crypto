const { loadConfig, loadNn, createInputs, createOutputs, loadPregenerated } = require('./common')
const { progressBar } = require('./sampling/progressBar')

const pregeneratedFeed = async (config, onSample, onSave) => {
    const pregenerated = await loadPregenerated(config)
    if (pregenerated) {
        const bar = progressBar(`Feeding ${pregenerated.length} samples...`)
        bar.start(pregenerated.length, 0)
        for (let i = 0; i < pregenerated.length; i++) {
            await onSample(pregenerated[i].inputs, pregenerated[i].outputs)
            bar.update(i + 1)
        }
        bar.stop()
        await onSave()
        return true
    }
    return false
}

const generateOnTheFlyFeed = async (config, onSample, onSave) => {
    let lastSavedTime = Date.now()
    while (true) {
        // save model at intervals
        if (config.autosaveIntervalSecs) {
            const now = Date.now()
            if ((now - lastSavedTime) >= (config.autosaveIntervalSecs * 1000)) {
                await onSave()
                lastSavedTime = now
            }
        }

        // create the inputs
        const inputsInfo = await createInputs(config)

        // create the outputs
        const outputs = await createOutputs(config, inputsInfo.nextTradeIndex)

        // do the training
        await onSample(inputsInfo.inputs, outputs)
    }
}

const work = async () => {
    // Parse command line arguments
    const modelName = process.argv[2] || 'tpn'

    // load the configuration
    const config = await loadConfig(modelName)

    // create the NN
    const nn = await loadNn(config)

    // callbacks
    const onSave = async () => await nn.save()
    const onSample = async (inputArray, outputArray) => await nn.train(inputArray, outputArray)

    // start the feeding
    config.usePregeneratedSamples
        ? await pregeneratedFeed(config, onSample, onSave)
        : await generateOnTheFlyFeed(config, onSample, onSave)
}

work()
