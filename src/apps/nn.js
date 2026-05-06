import fs from 'fs'
import TensorFlowNetwork from '../nn/TensorFlowNetwork.js'

const configPath = process.argv[2]

if (!configPath) {
    console.error('Usage: nn <config.json>')
    process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const nn = await TensorFlowNetwork.loadOrCreate(config)
console.log(`Ready: ${nn.personality.name} (${nn.trainingRootPath})`)
