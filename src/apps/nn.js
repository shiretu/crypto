import fs from 'fs'
import path from 'path'
import TensorFlowNetwork from '../nn/TensorFlowNetwork.js'
import Candles from '../stores/Candles.js'
import { resolveSymbol } from '../core/resolveSymbol.js'
import Day from '../utils/Day.js'

const configPath = process.argv[2]
const fromArg = process.argv[3]
const toArg = process.argv[4]

if (!configPath || !fromArg || !toArg) {
    console.error('Usage: nn <config.json> <from> <to>')
    process.exit(1)
}

const from = Day.fromStr(fromArg)
const to = Day.fromStr(toArg)

if (Day.compare(from, to) >= 0) {
    console.error(`"from" date (${Day.toStr(from)}) must be before "to" date (${Day.toStr(to)})`)
    process.exit(1)
}

console.log(`Loading config from ${configPath}...`)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

console.log('Loading or creating neural network...')
const nn = await TensorFlowNetwork.loadOrCreate(config)
const { data } = nn.personality
const symbol = resolveSymbol(data.symbol)
const dataDir = path.resolve('data')

console.log(`Loading candles for ${symbol}...`)
const candlesStorage = new Candles(dataDir, symbol, data.candleDuration)
const candles = await candlesStorage.readArrayAsync(from, to)
console.log(`${candles.length} candles loaded`)

const { lookback } = data
const setCount = candles.length - lookback

if (setCount <= 0) {
    console.error(`Not enough candles: have ${candles.length}, need more than ${lookback}`)
    process.exit(1)
}

const indices = Array.from({ length: setCount }, (_, i) => i)
for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
}

console.log(`${setCount} sets of ${lookback} candles each (shuffled)`)
