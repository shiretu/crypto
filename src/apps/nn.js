import fs from 'fs'
import path from 'path'
import TensorFlowNetwork from '../nn/TensorFlowNetwork.js'
import DataSet from '../nn/DataSet.js'

const main = async () => {
    const DEFAULT_CONFIG_PATH = path.resolve('configs', 'nn', 'config.json')

    const usage = () => {
        console.error('Usage: nn <arch>:<personality> [--config <path>]')
        console.error('  arch        : architecture name (must be listed in config.neuralNetworks)')
        console.error('  personality : personality name (must be listed in config.personalities)')
        console.error(`  --config    : path to the NN config file (default: ${DEFAULT_CONFIG_PATH})`)
        process.exit(1)
    }

    // ── Parse CLI args ───────────────────────────────────────────────
    const rawArgs = process.argv.slice(2)
    let target = null
    let configPath = DEFAULT_CONFIG_PATH

    for (let i = 0; i < rawArgs.length; i++) {
        const a = rawArgs[i]
        if (a === '--config') {
            if (i + 1 >= rawArgs.length) { console.error('--config requires a path argument'); usage() }
            configPath = path.resolve(rawArgs[++i])
        } else if (a.startsWith('--config=')) {
            configPath = path.resolve(a.slice('--config='.length))
        } else if (target === null) {
            target = a
        } else {
            console.error(`Unexpected argument: ${a}`)
            usage()
        }
    }

    if (target === null) usage()

    const [archName, personalityName] = target.split(':', 2)
    if (!archName || !personalityName) {
        console.error(`Target must be in the form <arch>:<personality>, got "${target}"`)
        usage()
    }

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

    // ── Run ──────────────────────────────────────────────────────────
    const nnConfig = { name: archName, personality }

    console.log(`Architecture: ${archName}`)
    console.log(`Personality:  ${personality.name}`)

    const ds = new DataSet(personality.data)
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
