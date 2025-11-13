const { loadConfig, createInputs, createOutputs } = require('./common')
const cliProgress = require('cli-progress')
const Samples = require('./sampling/Samples')
const path = require('path')
const Symbol = require('../core/Symbol')
const fs = require('fs').promises

const work = async () => {
    // establish the samples count
    const sampleCount = parseInt(process.argv[2]) || 50000

    // Load config from any model (they share global_config.json)
    const config = await loadConfig('lstm')

    // create the UI progress bar
    console.log(`Creating ${sampleCount} samples to ${config.pregeneratedSamplesDataPath}...`)
    const bar = new cliProgress.SingleBar()
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

const work2 = async () => {
    const config = {
        data: {
            folder: path.resolve(__dirname, '..', '..', 'data'),
            exchange: {
                name: 'binance'
            },
            symbol: Symbol.find('btcusdc'),
            candle: {
                periodSec: 60
            }
        },
        train: {
            candlesWindowCount: 120,
            candlesPreambleCount: 100,
            startTimestamp: new Date('2024-01-01T00:00:00Z'),
            endTimestamp: new Date('2024-12-31T23:59:59Z'),
            samplesCount: null,
            normalizeAroundZero: false,
            normalizationFactor: 1
        },
        candle: {
            periodSec: 60
        },
        trade: {
            maxDurationSec: 3600,
            tpPercent: 1 / 100,
            slPercent: 0.5 / 100
        }
    }
    const cachedResources = {}
    const samples = await Samples.create(config, cachedResources)
    console.log('Samples created:', samples)
}

work2()
