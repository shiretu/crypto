import CandleRefs from '../stores/CandleRefs.js'
import Candle from '../core/Candle.js'
import Trades from '../stores/Trades.js'
import Day from '../utils/Day.js'
import CandleDuration from '../core/CandleDuration.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const usage = () => {
    console.error('Usage: getCandles <exchange:base:quote> <duration> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  symbol   : exchange:base:quote (e.g. binance:eth:usdc)')
    console.error('  duration : candle duration in seconds (60, 300, 900, 1800, 3600, 14400)')
    console.error('  start    : optional start date, defaults to last month')
    console.error('  end      : optional end date, defaults to last month')
    process.exit(1)
}

const args = process.argv.slice(2)
if (args.length < 2) usage()

const sym = resolveSymbol(args[0])
const duration = parseInt(args[1])
if (isNaN(duration)) usage()

const thisMonth = Day.thisMonth()
const start = args[2] ? Day.fromStr(args[2]) : Day.offsetByMonths(thisMonth, -1)
const end = args[3] ? Day.fromStr(args[3]) : Day.prevDay(thisMonth)

console.log(`Candles ${sym.id} @ ${duration}s`)
console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)

const candleStore = new CandleRefs('data', sym, duration)
candleStore.onActivity = (e) => {
    if (e.type === 'computing') {
        process.stdout.write(`\r${Day.toStr(e.dayTsUs)} computing candles...        `)
    } else if (e.type === 'loaded') {
        process.stdout.write(`\r${Day.toStr(e.dayTsUs)} ${e.source} (${e.records} candles)        `)
    }
}
await candleStore.loadAsync(start, end)

console.log(`\nDone. ${candleStore.count} candles.`)
console.log(`First: ${candleStore.firstTsUs} (${Day.toStr(candleStore.firstTsUs)})`)
console.log(`Last:  ${candleStore.lastTsUs} (${Day.toStr(candleStore.lastTsUs)})`)

// Hydrate a few candles to show prices
const tradesStore = new Trades('data', sym)
await tradesStore.loadAsync(start, end)

const hydrate = (ref) => Candle.fromRef(duration, ref, tradesStore)

const first = hydrate(candleStore.get(0))
const mid = hydrate(candleStore.get(Math.floor(candleStore.count / 2)))
const last = hydrate(candleStore.get(candleStore.count - 1))

const fmt = (c) => `ordinal=${c.ordinal} O=${c.open.price} H=${c.high.price} L=${c.low.price} C=${c.close.price}`
console.log('\nget():')
console.log(`  [0] ${fmt(first)}`)
console.log(`  [${Math.floor(candleStore.count / 2)}] ${fmt(mid)}`)
console.log(`  [${candleStore.count - 1}] ${fmt(last)}`)

// getAt: lookup candle refs by openTsUs + index, then hydrate
const firstRef = candleStore.get(0)
const midRef = candleStore.get(Math.floor(candleStore.count / 2))
const lastRef = candleStore.get(candleStore.count - 1)

const firstAt = hydrate(candleStore.getAt(firstRef.openTsUs, firstRef.index))
const midAt = hydrate(candleStore.getAt(midRef.openTsUs, midRef.index))
const lastAt = hydrate(candleStore.getAt(lastRef.openTsUs, lastRef.index))

console.log('\ngetAt():')
console.log(`  ${fmt(firstAt)}`)
console.log(`  ${fmt(midAt)}`)
console.log(`  ${fmt(lastAt)}`)
