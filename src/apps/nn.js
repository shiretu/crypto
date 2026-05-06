import fs from 'fs'
import path from 'path'
import TensorFlowNetwork from '../nn/TensorFlowNetwork.js'
import Candles from '../stores/Candles.js'
import TradeOutcomes from '../stores/TradeOutcomes.js'
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
const candlesStore = new Candles(dataDir, symbol, data.candleDuration)
const outcomesStore = new TradeOutcomes(dataDir, symbol, { tpPercent: data.tpPercent, slPercent: data.slPercent })
const candles = await candlesStore.readArrayAsync(from, to)
console.log(`${candles.length} candles loaded`)

const { lookback } = data
const setSize = lookback + 1
const setCount = candles.length - setSize

if (setCount <= 0) {
    console.error(`Not enough candles: have ${candles.length}, need more than ${setSize}`)
    process.exit(1)
}

const indices = Array.from({ length: setCount }, (_, i) => i)
for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
}

console.log(`${setCount} sets of ${lookback} candles each (shuffled)`)

const dataSets = []
for (let i = 0; i < indices.length; i++) {
    const startCandleIdx = indices[i]
    const selectedCandles = candles.slice(startCandleIdx, startCandleIdx + lookback)
    const openTrade = candles[startCandleIdx + lookback].open
    const outcome = await outcomesStore.readAtAsync(openTrade.tsUs)
    dataSets.push({
        inputs: selectedCandles,
        label: outcome.longOrder.profitPercent > 0 ? 1 : 0
    })
    if ((i + 1) % 1000 === 0) {
        process.stdout.write(`\r${i + 1} / ${setCount} sets processed        `)
    }
}

const longs = dataSets.filter(d => d.label === 1).length
console.log(`\n${dataSets.length} data sets ready (${longs} long, ${dataSets.length - longs} short)`)
