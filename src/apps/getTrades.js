import { Command } from 'commander'
import Trades from '../stores/Trades.js'
import Day from '../utils/Day.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const thisMonth = Day.thisMonth()
const opts = new Command()
    .name('getTrades')
    .description('Download/load raw trades for a symbol over a date range')
    .requiredOption('-s, --symbol <exchange:base:quote>', 'symbol (e.g. binance:eth:usdc)')
    .option('--start <YYYY-MM-DD>', 'start date (defaults to first day of last month)', Day.fromStr, Day.offsetByMonths(thisMonth, -1))
    .option('--end <YYYY-MM-DD>', 'end date (defaults to last day of last month)', Day.fromStr, Day.prevDay(thisMonth))
    .showHelpAfterError()
    .parse(process.argv)
    .opts()

const sym = resolveSymbol(opts.symbol)
const { start, end } = opts

console.log(`Fetching ${sym.id}`)
console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)

const totalDays = (end - start) / Day.usPerDay + 1

const store = new Trades('data', sym)
store.onActivity = (e) => {
    const pct = ((e.dayTsUs - start) / Day.usPerDay / totalDays * 100).toFixed(1)
    if (e.type === 'computing') {
        process.stdout.write(`\r${Day.toStr(e.dayTsUs)} downloading... (${pct}%)        `)
    } else if (e.type === 'loaded') {
        process.stdout.write(`\r${Day.toStr(e.dayTsUs)} ${e.source} (${e.records} records) (${pct}%)        `)
    }
}
await store.loadAsync(start, end)

console.log(`\nDone. ${store.count} trades.`)
console.log(`First: ${store.firstTsUs} (${Day.toStr(store.firstTsUs)})`)
console.log(`Last:  ${store.lastTsUs} (${Day.toStr(store.lastTsUs)})`)

const first = store.get(0)
const mid = store.get(Math.floor(store.count / 2))
const last = store.get(store.count - 1)

const fmt = (t) => `tsUs=${t.tsUs} price=${t.price} qty=${t.baseQty} ${t.isBuyerMaker ? 'sell' : 'buy'}`
console.log('\nget():')
console.log(`  [0] ${fmt(first)}`)
console.log(`  [${Math.floor(store.count / 2)}] ${fmt(mid)}`)
console.log(`  [${store.count - 1}] ${fmt(last)}`)
