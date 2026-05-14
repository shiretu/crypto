import fs from 'fs'
import path from 'path'
import TensorFlowNetwork from '../nn/TensorFlowNetwork.js'

const usage = () => {
    console.error('Usage: nn <config.json>')
    console.error('  config : path to a NN config file (see configs/nn/config.json)')
    process.exit(1)
}

const args = process.argv.slice(2)
if (args.length < 1) usage()

const configPath = path.resolve(args[0])
if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`)
    process.exit(1)
}

console.log(`Loading config from ${configPath}`)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

console.log(`Architecture: ${config.name}`)
console.log(`Personality:  ${config.personality.name}`)

let nn
let loaded = false
try {
    nn = await TensorFlowNetwork.load(config)
    loaded = true
} catch (err) {
    if (err.code !== 'MODEL_NOT_FOUND') throw err
    nn = await TensorFlowNetwork.create(config)
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
