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
    await ds.load()

    let nn
    let loaded = false
    try {
        nn = await TensorFlowNetwork.load(nnConfig)
        loaded = true
    } catch (err) {
        if (err.code !== 'MODEL_NOT_FOUND') throw err
        nn = await TensorFlowNetwork.create(nnConfig)
    }

    console.log(`Model:        ${loaded ? 'loaded from disk' : 'newly created'}`)
    console.log(`Fingerprint:  ${path.basename(nn.trainingRootPath)}`)
    console.log(`Runtime:      ${nn.trainingRootPath}`)
    console.log('')
    console.log('Architecture:')
    for (const layer of nn.arch.layers) {
        const shape = layer.inputShape ? `  input=${JSON.stringify(layer.inputShape)}` : ''
        console.log(`  - ${layer.type} units=${layer.units} act=${layer.activation}${shape}`)
    }
    console.log('')
    console.log('Recipe (data):')
    for (const [k, v] of Object.entries(nn.personality.data)) {
        console.log(`  ${k.padEnd(16)} ${v}`)
    }
    console.log('')
    console.log('Recipe (train):')
    for (const [k, v] of Object.entries(nn.personality.train)) {
        console.log(`  ${k.padEnd(16)} ${v}`)
    }
}

await main()
