const { loadConfig, createInputs, createOutputs } = require('./common')
const cliProgress = require('cli-progress')
const fs = require('fs').promises

const work = async () => {
    // establish the samples count
    const sampleCount = parseInt(process.argv[2]) || 50000

    // Load config from any model (they share global_config.json)
    const config = await loadConfig('lstm')

    // create the UI progress bar
    console.log(`Creating ${sampleCount} samples to ${config.pregeneratedSamplesDataPath}...`)
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar.start(sampleCount, 0)

    // do the damage
    const all = []
    const alreadyProcessed = new Set()
    for (let i = 0; i < sampleCount; i++) {
        // create the inputs
        const inputsInfo = await createInputs(config)
        if (alreadyProcessed.has(inputsInfo.firstCandleIndex)) {
            i--
            continue
        }
        alreadyProcessed.add(inputsInfo.firstCandleIndex)

        // create the outputs
        const outputs = await createOutputs(config, inputsInfo.nextTradeIndex)

        all.push([inputsInfo.firstCandleIndex, inputsInfo.nextTradeIndex])
        all.push(inputsInfo.inputs.flat())
        all.push(outputs)

        // update
        bar.update(i)

        if ((i % 1000 === 0)) {
            console.log(`\nSaving intermediate pregenerated samples to ${config.pregeneratedSamplesDataPath}...`)
            await fs.writeFile(config.pregeneratedSamplesDataPath, Buffer.from(new Float64Array(all.flat()).buffer))
        }
    }

    // done
    bar.stop()

    console.log(`Saving pregenerated samples to ${config.pregeneratedSamplesDataPath}...`)
    await fs.writeFile(config.pregeneratedSamplesDataPath, Buffer.from(new Float64Array(all.flat()).buffer))
}

work()
