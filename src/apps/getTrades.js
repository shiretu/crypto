import Trades from '../stores/Trades.js'
import { parseDate, yesterday, fmtDate } from '../utils/date.js'
import { resolveExchangeAndSymbol } from '../utils/cli.js'

const usage = () => {
    console.error('Usage: getTrades <exchange> <symbol> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  exchange  : exchange id (e.g. binance)')
    console.error('  symbol    : symbol pair id (e.g. btc:usdc)')
    console.error('  start     : optional start date (e.g. 2024-01-01), defaults to 2024-01-01')
    console.error('  end       : optional end date (e.g. 2024-06-30), defaults to yesterday')
    process.exit(1)
}

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 2) usage()

    const { exchange, symbol } = resolveExchangeAndSymbol(args[0], args[1])

    const start = args[2] ? parseDate(args[2]) : { year: 2024, month: 1, day: 1 }
    const end = args[3] ? parseDate(args[3]) : yesterday()

    console.log(`Fetching ${symbol} from ${exchange.id}`)
    console.log(`Range: ${fmtDate(start)} to ${fmtDate(end)}`)

    const store = new Trades('data', symbol)
    let count = 0
    for await (const trade of store.readTrades(start.year, start.month, start.day, end.year, end.month, end.day)) {
        count++
    }

    console.log(`Done. ${count} trades.`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
