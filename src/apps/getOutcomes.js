import Outcomes from '../stores/Outcomes.js'
import Trades from '../stores/Trades.js'
import Candles from '../stores/Candles.js'
import { fromOutcomeRef } from '../core/Outcome.js'
import Day from '../utils/Day.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const usage = () => {
    console.error('Usage: getOutcomes <exchange:base:quote> <tpPercent> <slPercent> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  symbol    : exchange:base:quote (e.g. binance:eth:usdc)')
    console.error('  tpPercent : take profit percent (e.g. 1.5)')
    console.error('  slPercent : stop loss percent (e.g. 1)')
    console.error('  start     : optional start date, defaults to last month')
    console.error('  end       : optional end date, defaults to last month')
    process.exit(1)
}

const args = process.argv.slice(2)
if (args.length < 3) usage()

const sym = resolveSymbol(args[0])
const tpPercent = parseFloat(args[1])
const slPercent = parseFloat(args[2])
if (isNaN(tpPercent) || tpPercent <= 0) { console.error(`Invalid tpPercent: ${args[1]}`); process.exit(1) }
if (isNaN(slPercent) || slPercent <= 0) { console.error(`Invalid slPercent: ${args[2]}`); process.exit(1) }

const thisMonth = Day.thisMonth()
const start = args[3] ? Day.fromStr(args[3]) : Day.offsetByMonths(thisMonth, -1)
const end = args[4] ? Day.fromStr(args[4]) : Day.prevDay(thisMonth)

const totalDays = (end - start) / Day.usPerDay + 1

console.log(`Outcomes ${sym.id} TP=${tpPercent}% SL=${slPercent}%`)
console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)

// const tradesStore = new Trades('data', sym)
// tradesStore.onActivity = (e) => {
//     if (e.type === 'readFile') {
//         console.log(`\nLoading file ${e.filePath}               `)
//         return
//     }
//     const pct = ((e.dayTsUs - start) / Day.usPerDay / totalDays * 100).toFixed(1)
//     if (e.type === 'computing') {
//         process.stdout.write(`\rTrades: ${Day.toStr(e.dayTsUs)} downloading... (${pct}%)        `)
//     } else if (e.type === 'loaded') {
//         process.stdout.write(`\rTrades: ${Day.toStr(e.dayTsUs)} ${e.source} (${e.records} trades) (${pct}%)        `)
//     }
// }
// await tradesStore.loadAsync(start, end)
// tradesStore.onActivity = null
// console.log(`${tradesStore.count} trades loaded.`)

// const candlesStore = new Candles('data', sym, 30, tradesStore)
// candlesStore.onActivity = (e) => {
//     if (e.type === 'readFile') {
//         console.log(`\nLoading file ${e.filePath}               `)
//         return
//     }
//     const pct = ((e.dayTsUs - start) / Day.usPerDay / totalDays * 100).toFixed(1)
//     if (e.type === 'computing') {
//         process.stdout.write(`\rCandles: ${Day.toStr(e.dayTsUs)} computing... (${pct}%)        `)
//     } else if (e.type === 'loaded') {
//         process.stdout.write(`\rCandles: ${Day.toStr(e.dayTsUs)} ${e.source} (${e.records} candles) (${pct}%)        `)
//     }
// }
// await candlesStore.loadAsync(start, end)
// candlesStore.onActivity = null
// console.log(`${candlesStore.count} candles loaded.`)

const outcomeStore = new Outcomes('data', sym, tpPercent, slPercent)
const allStates = new Map()
let currentDayTsUs = null
outcomeStore.onActivity = (e) => {
    if (e.type !== 'progress') return
    if (e.dayTsUs !== currentDayTsUs) {
        currentDayTsUs = e.dayTsUs
        allStates.clear()
    }
    let state = allStates.get(e.chunkStart)
    if (!state) {
        state = { chunkStart: e.chunkStart, chunkSize: e.chunkSize, processed: 0, total: e.total, dayTsUs: e.dayTsUs }
        allStates.set(e.chunkStart, state)
    }
    state.processed = e.processed
}
const bar = (ratio, width = 20) => {
    const filled = Math.round(ratio * width)
    return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const render = () => {
    if (allStates.size === 0) return
    const dayTotal = allStates.values().next().value.total

    const sorted = [...allStates.values()].sort((a, b) => a.chunkStart - b.chunkStart)

    const rows = []
    let totalProcessed = 0
    for (const s of sorted) {
        totalProcessed += s.processed
        const ratio = s.chunkSize > 0 ? s.processed / s.chunkSize : 0
        rows.push({ chunk: s.chunkStart, progress: bar(ratio), pct: `${(ratio * 100).toFixed(1)}%`, processed: s.processed, size: s.chunkSize })
    }

    const totalRatio = dayTotal > 0 ? totalProcessed / dayTotal : 0
    rows.unshift({ chunk: 'TOTAL', progress: bar(totalRatio), pct: `${(totalRatio * 100).toFixed(1)}%`, processed: totalProcessed, size: dayTotal })

    process.stdout.write('\x1b[H\x1b[J')
    console.log(`Outcomes ${Day.toStr(currentDayTsUs)}  workers: ${allStates.size}`)
    console.table(rows)
}

const renderInterval = setInterval(render, 100)
await outcomeStore.loadAsync(start, end)
clearInterval(renderInterval)
render()
process.stdout.write('\n')

console.log(`\nDone. ${outcomeStore.count} outcomes.`)
console.log(`First: ${outcomeStore.firstTsUs} (${Day.toStr(outcomeStore.firstTsUs)})`)
console.log(`Last:  ${outcomeStore.lastTsUs} (${Day.toStr(outcomeStore.lastTsUs)})`)

// Hydrate a few outcomes
// const hydrate = (ref) => fromOutcomeRef(ref, tpPercent, slPercent, tradesStore)

// const first = hydrate(outcomeStore.get(0))
// const mid = hydrate(outcomeStore.get(Math.floor(outcomeStore.count / 2)))
// const last = hydrate(outcomeStore.get(outcomeStore.count - 1))

// const fmt = (o) => `long=${o.longOrder.profitPercent.toFixed(2)}% short=${o.shortOrder.profitPercent.toFixed(2)}% open=${o.openTrade.price}`
// console.log(`\n  [0] ${fmt(first)}`)
// console.log(`  [${Math.floor(outcomeStore.count / 2)}] ${fmt(mid)}`)
// console.log(`  [${outcomeStore.count - 1}] ${fmt(last)}`)
