import Trades from '../stores/Trades.js'
import Day from '../utils/Day.js'
import { lastMonth } from './utils.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const usage = () => {
    console.error('Usage: getTrades <symbol> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  symbol    : exchange:base:quote (e.g. binance:btc:usdc)')
    console.error('  start     : optional start date (e.g. 2024-01-01), defaults to last month')
    console.error('  end       : optional end date (e.g. 2024-06-30), defaults to last month')
    process.exit(1)
}

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 1) usage()

    const symbol = resolveSymbol(args[0])

    const defaults = lastMonth()
    const start = args[1] ? Day.fromStr(args[1]) : defaults.start
    const end = args[2] ? Day.fromStr(args[2]) : defaults.end

    console.log(`Fetching ${symbol}`)
    console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)

    const store = new Trades('data', symbol)
    let count = 0
    for await (const trade of store.readAsync(start, end)) {
        count++
    }

    console.log(`Done. ${count} trades.`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
