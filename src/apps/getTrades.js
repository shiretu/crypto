import Trades from '../stores/Trades.js'
import Day from '../utils/Day.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const usage = () => {
    console.error('Usage: getTrades <exchange:base:quote> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  symbol : exchange:base:quote (e.g. binance:eth:usdc)')
    console.error('  start  : optional start date, defaults to last month')
    console.error('  end    : optional end date, defaults to last month')
    process.exit(1)
}

const args = process.argv.slice(2)
if (args.length < 1) usage()

const sym = resolveSymbol(args[0])

const thisMonth = Day.thisMonth()
const start = args[1] ? Day.fromStr(args[1]) : Day.offsetByMonths(thisMonth, -1)
const end = args[2] ? Day.fromStr(args[2]) : Day.prevDay(thisMonth)

console.log(`Fetching ${sym.id}`)
console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)

const store = new Trades('data', sym)
store.onActivity = (e) => {
    if (e.type === 'computing') {
        process.stdout.write(`\r${Day.toStr(e.dayTsUs)} downloading...        `)
    } else if (e.type === 'loaded') {
        process.stdout.write(`\r${Day.toStr(e.dayTsUs)} ${e.source} (${e.records} records)        `)
    }
}
await store.loadAsync(start, end)

console.log(`\nDone. ${store.count} trades.`)
console.log(`First: ${store.firstTsUs} (${Day.toStr(store.firstTsUs)})`)
console.log(`Last:  ${store.lastTsUs} (${Day.toStr(store.lastTsUs)})`)

const first = store.get(0)
const mid = store.get(Math.floor(store.count / 2))
const last = store.get(store.count - 1)

const fmt = (t) => `tsUs=${t.tsUs} index=${t.index} price=${t.price} qty=${t.baseQty} ${t.isBuyerMaker ? 'sell' : 'buy'}`
console.log('\nget():')
console.log(`  [0] ${fmt(first)}`)
console.log(`  [${Math.floor(store.count / 2)}] ${fmt(mid)}`)
console.log(`  [${store.count - 1}] ${fmt(last)}`)

const firstAt = store.getAt(first.tsUs, first.index)
const midAt = store.getAt(mid.tsUs, mid.index)
const lastAt = store.getAt(last.tsUs, last.index)

console.log('\ngetAt():')
console.log(`  ${fmt(firstAt)}`)
console.log(`  ${fmt(midAt)}`)
console.log(`  ${fmt(lastAt)}`)
