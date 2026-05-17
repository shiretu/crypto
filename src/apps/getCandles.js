import { Command, InvalidArgumentError } from 'commander'
import Candles from '../stores/Candles.js'
import Trades from '../stores/Trades.js'
import Candle, { fromCandleRef } from '../core/Candle.js'
import Day from '../utils/Day.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const parseDurationSec = (value) => {
    const n = parseInt(value, 10)
    if (Number.isNaN(n) || n <= 0) throw new InvalidArgumentError(`duration must be a positive integer, got "${value}"`)
    return n
}

const thisMonth = Day.thisMonth()
const opts = new Command()
    .name('getCandles')
    .description('Build/load candles for a symbol over a date range')
    .requiredOption('-s, --symbol <exchange:base:quote>', 'symbol (e.g. binance:eth:usdc)')
    .requiredOption('-d, --duration <seconds>', 'candle duration in seconds (60, 300, 900, 1800, 3600, 14400)', parseDurationSec)
    .option('--start <YYYY-MM-DD>', 'start date (defaults to first day of last month)', Day.fromStr, Day.offsetByMonths(thisMonth, -1))
    .option('--end <YYYY-MM-DD>', 'end date (defaults to last day of last month)', Day.fromStr, Day.prevDay(thisMonth))
    .showHelpAfterError()
    .parse(process.argv)
    .opts()

const sym = resolveSymbol(opts.symbol)
const { duration, start, end } = opts

console.log(`Candles ${sym.id} @ ${duration}s`)
console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)

const totalDays = (end - start) / Day.usPerDay + 1

const tradesStore = new Trades('data', sym)
tradesStore.onActivity = (e) => {
    const pct = ((e.dayTsUs - start) / Day.usPerDay / totalDays * 100).toFixed(1)
    if (e.type === 'computing') {
        process.stdout.write(`\rTrades: ${Day.toStr(e.dayTsUs)} downloading... (${pct}%)        `)
    } else if (e.type === 'loaded') {
        process.stdout.write(`\rTrades: ${Day.toStr(e.dayTsUs)} ${e.source} (${e.records} trades) (${pct}%)        `)
    }
}
await tradesStore.loadAsync(start, end)
tradesStore.onActivity = null
console.log(`${tradesStore.count} trades loaded.`)

const candleStore = new Candles('data', sym, duration, tradesStore)
candleStore.onActivity = (e) => {
    const pct = ((e.dayTsUs - start) / Day.usPerDay / totalDays * 100).toFixed(1)
    if (e.type === 'computing') {
        process.stdout.write(`\rCandles: ${Day.toStr(e.dayTsUs)} computing... (${pct}%)                           `)
    } else if (e.type === 'loaded') {
        process.stdout.write(`\rCandles: ${Day.toStr(e.dayTsUs)} ${e.source} (${e.records} candles) (${pct}%)        `)
    }
}
await candleStore.loadAsync(start, end)

console.log(`\nDone. ${candleStore.count} candles.`)
console.log(`First: ${candleStore.firstTsUs} (${Day.toStr(candleStore.firstTsUs)})`)
console.log(`Last:  ${candleStore.lastTsUs} (${Day.toStr(candleStore.lastTsUs)})`)

// Hydrate a few candles
await tradesStore.loadAsync(start, end)

const hydrate = (ref) => fromCandleRef(ref, duration, tradesStore)

const first = hydrate(candleStore.get(0))
const mid = hydrate(candleStore.get(Math.floor(candleStore.count / 2)))
const last = hydrate(candleStore.get(candleStore.count - 1))

const fmt = (c) => `ordinal=${c.ordinal} O=${c.open.price} H=${c.high.price} L=${c.low.price} C=${c.close.price}`
console.log(`\n  [0] ${fmt(first)}`)
console.log(`  [${Math.floor(candleStore.count / 2)}] ${fmt(mid)}`)
console.log(`  [${candleStore.count - 1}] ${fmt(last)}`)
