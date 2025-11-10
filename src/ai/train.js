const { loadConfig, loadNn, createInputs, createOutputs } = require('./common')

const work = async () => {
    // Parse command line arguments
    const modelName = process.argv[2] || 'lstm'

    // load the configuration
    const config = await loadConfig(modelName)

    // create the NN
    const nn = await loadNn(config)

    let lastSavedTime = Date.now()
    while (true) {
        // save model at intervals
        if (config.autosaveIntervalSecs) {
            const now = Date.now()
            if ((now - lastSavedTime) >= (config.autosaveIntervalSecs * 1000)) {
                await nn.save()
                lastSavedTime = now
            }
        }

        // create the inputs
        const inputsInfo = await createInputs(config)

        // create the outputs
        const outputs = await createOutputs(config, inputsInfo.nextTradeIndex)

        // do the training
        await nn.train(inputsInfo.inputs, outputs)
    }
}

work()
