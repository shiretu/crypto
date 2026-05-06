import fs from 'fs'
import path from 'path'
import TensorFlowNetwork from '../nn/TensorFlowNetwork.js'
import Candles from '../stores/Candles.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const configPath = process.argv[2]

if (!configPath) {
    console.error('Usage: nn <config.json>')
    process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const nn = await TensorFlowNetwork.loadOrCreate(config)
const { data } = nn.personality

const symbol = resolveSymbol(data.symbol)
const dataDir = path.resolve('data')
const candles = new Candles(dataDir, symbol, data.candleDuration)

console.log(`Ready: ${nn.personality.name} (${nn.trainingRootPath})`)
console.log(`Candles: ${symbol.id} @ ${data.candleDuration}s`)
