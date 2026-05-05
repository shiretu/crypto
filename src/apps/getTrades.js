import Trades from '../stores/Trades.js'
import Day from '../utils/Day.js'
import { lastMonth } from './utils.js'
import { resolveExchangeAndSymbol } from '../utils/cli.js'

const usage = () => {
    console.error('Usage: getTrades <exchange> <symbol> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  exchange  : exchange id (e.g. binance)')
    console.error('  symbol    : symbol pair id (e.g. btc:usdc)')
    console.error('  start     : optional start date (e.g. 2024-01-01), defaults to last month')
    console.error('  end       : optional end date (e.g. 2024-06-30), defaults to last month')
    process.exit(1)
}

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 2) usage()

    const { exchange, symbol } = resolveExchangeAndSymbol(args[0], args[1])

    const defaults = lastMonth()
    const start = args[2] ? Day.fromStr(args[2]) : defaults.start
    const end = args[3] ? Day.fromStr(args[3]) : defaults.end

    console.log(`Fetching ${symbol} from ${exchange.id}`)
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
