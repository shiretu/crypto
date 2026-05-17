import fs from 'fs'
import path from 'path'
import { Command } from 'commander'
import TensorFlowNetwork from '../nn/TensorFlowNetwork.js'
import DataSet from '../nn/DataSet.js'

const DEFAULT_CONFIG_PATH = path.resolve('configs', 'nn', 'config.json')

const parseCliArgs = (argv) => {
    const program = new Command()
        .name('nn')
        .description('Build, load, or train a neural network described by an arch.json + personality config')
        .requiredOption('-a, --arch <name>', 'architecture name (must be listed in config.neuralNetworks)')
        .requiredOption('-p, --personality <name>', 'personality name (must be listed in config.personalities)')
        .option('-c, --config <path>', 'path to the NN config file', DEFAULT_CONFIG_PATH)
        .showHelpAfterError()
        .parse(argv, { from: 'user' })

    const { arch: archName, personality: personalityName, config: configPath } = program.opts()

    return {
        archName,
        personalityName,
        configPath: path.resolve(configPath)
    }
}

const main = async () => {
    const { archName, personalityName, configPath } = parseCliArgs(process.argv.slice(2))

    // ── Load config ──────────────────────────────────────────────────
    if (!fs.existsSync(configPath)) {
        console.error(`Config not found: ${configPath}`)
        process.exit(1)
    }

    console.log(`Loading config from ${configPath}`)
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

    if (!Array.isArray(config.neuralNetworks)) {
        console.error('Config must have a "neuralNetworks" array of architecture names.')
        process.exit(1)
    }
    if (!Array.isArray(config.dataSets)) {
        console.error('Config must have a "dataSets" array of named dataset recipes.')
        process.exit(1)
    }
    if (!Array.isArray(config.personalities)) {
        console.error('Config must have a "personalities" array of personality objects.')
        process.exit(1)
    }

    if (!config.neuralNetworks.includes(archName)) {
        console.error(`Architecture "${archName}" not in config.neuralNetworks: [${config.neuralNetworks.join(', ')}]`)
        process.exit(1)
    }

    const personality = config.personalities.find(p => p.name === personalityName)
    if (!personality) {
        const names = config.personalities.map(p => p.name).join(', ')
        console.error(`Personality "${personalityName}" not in config.personalities: [${names}]`)
        process.exit(1)
    }

    // Resolve the personality's dataSet reference into the actual recipe.
    // The dataSet name is stripped before passing it downstream so two
    // personalities pointing at the same recipe share the same on-disk
    // fingerprint folder (data/nn/datasets/<fp>/).
    if (typeof personality.dataSet !== 'string') {
        console.error(`Personality "${personalityName}" must have a string "dataSet" field referencing a config.dataSets entry.`)
        process.exit(1)
    }
    const dataSetEntry = config.dataSets.find(d => d.name === personality.dataSet)
    if (!dataSetEntry) {
        const names = config.dataSets.map(d => d.name).join(', ')
        console.error(`DataSet "${personality.dataSet}" referenced by personality "${personalityName}" not in config.dataSets: [${names}]`)
        process.exit(1)
    }
    const { name: dataSetName, ...dataRecipe } = dataSetEntry
    const resolvedPersonality = {
        name: personality.name,
        data: dataRecipe,
        train: personality.train
    }

    // ── Run ──────────────────────────────────────────────────────────
    const nnConfig = { name: archName, personality: resolvedPersonality }

    console.log(`Architecture: ${archName}`)
    console.log(`Personality:  ${resolvedPersonality.name}`)
    console.log(`DataSet:      ${dataSetName}`)

    const ds = new DataSet(dataSetName, resolvedPersonality.data)
    const samplesBuf = await ds.load()

    let nn
    let loaded = false
    try {
        nn = await TensorFlowNetwork.load(nnConfig)
        loaded = true
    } catch (err) {
        if (err.code !== 'MODEL_NOT_FOUND') throw err
        nn = await TensorFlowNetwork.create(nnConfig)
    }

    // ── Decode samples.bin into flat Float32Arrays ────────────────────
    // samples.bin is a tight packing of [feature×F, label×L] per sample,
    // little-endian float32. We view it as a single Float32Array once and
    // split rows into separate inputs/labels arrays so tf.tensor2d can take
    // them with explicit shapes.
    //
    // The dataset stores L labels per sample, but the network only consumes
    // the first LABELS_USED of them. The rest of the labels stay on disk for
    // future heads / multi-task experiments.
    //
    // Likewise, the dataset stores CHANNELS_IN channels per timestep but the
    // network only consumes CHANNELS_USED of them — we skip channel 0
    // (`tsFraction`) because it collapses to a constant ramp across all
    // gap-free samples and carries no learnable signal. The data on disk is
    // left intact for future experiments / different normalisers.
    const FLOAT_SIZE = 4
    const N = ds.samplesCount
    const F = ds.featuresCount
    const L = ds.labelsCount
    const LABELS_USED = 1
    const TIMESTEPS = resolvedPersonality.data.windowSize
    const CHANNELS_IN = F / TIMESTEPS
    const CHANNELS_USED = CHANNELS_IN - 1
    const F_USED = TIMESTEPS * CHANNELS_USED
    if (!Number.isInteger(CHANNELS_IN)) {
        throw new Error(`featuresCount (${F}) is not a multiple of windowSize (${TIMESTEPS})`)
    }
    const flat = new Float32Array(samplesBuf.buffer, samplesBuf.byteOffset, samplesBuf.byteLength / FLOAT_SIZE)
    const inputs = new Float32Array(N * F_USED)
    const labels = new Float32Array(N * LABELS_USED)
    for (let i = 0; i < N; i++) {
        const src = i * (F + L)
        const dst = i * F_USED
        // For each timestep, copy channels [1..CHANNELS_IN-1] (skip channel 0).
        for (let t = 0; t < TIMESTEPS; t++) {
            const srcChan = src + t * CHANNELS_IN + 1
            const dstChan = dst + t * CHANNELS_USED
            inputs.set(flat.subarray(srcChan, srcChan + CHANNELS_USED), dstChan)
        }
        labels.set(flat.subarray(src + F, src + F + LABELS_USED), i * LABELS_USED)
    }

    console.log(`Samples:      ${N} × (${TIMESTEPS}×${CHANNELS_IN} features + ${L} labels, using ${TIMESTEPS}×${CHANNELS_USED} features + ${LABELS_USED} labels)`)
    console.log(`Model:        ${loaded ? 'loaded from disk' : 'newly created'}`)
    console.log(`Runtime:      ${nn.trainingRootPath}`)
    console.log(`Training:     epochs=${resolvedPersonality.train.epochs ?? 10} batchSize=${resolvedPersonality.train.batchSize ?? 32} learningRate=${resolvedPersonality.train.learningRate ?? 0.001} validationSplit=${resolvedPersonality.train.validationSplit ?? 0.2}`)
    console.log('')

    await nn.train({ inputs, labels, samplesCount: N, featuresCount: F_USED, labelsCount: LABELS_USED })
    await nn.save()
    console.log(`\nSaved trained model to ${nn.trainingRootPath}`)
}

await main()
