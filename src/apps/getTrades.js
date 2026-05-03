import { getExchange } from '../exchanges/index.js'
import TradeStore from '../sources/TradeStore.js'

const usage = () => {
    console.error('Usage: getTrades <exchange> <symbol> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  exchange  : exchange id (e.g. binance)')
    console.error('  symbol    : symbol pair id (e.g. btc:usdc)')
    console.error('  start     : optional start date (e.g. 2024-01-01), defaults to 2024-01-01')
    console.error('  end       : optional end date (e.g. 2024-06-30), defaults to yesterday')
    process.exit(1)
}

const parseDate = (str) => {
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) }
    const matchMonth = str.match(/^(\d{4})-(\d{2})$/)
    if (matchMonth) return { year: parseInt(matchMonth[1]), month: parseInt(matchMonth[2]), day: 1 }
    throw new Error(`Invalid date format: ${str} (expected YYYY-MM-DD or YYYY-MM)`)
}

const yesterday = () => {
    const d = new Date(Date.now() - 86400000)
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

const fmtDate = (d) =>
    `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 2) usage()

    const exchangeId = args[0]
    const symbolId = args[1]

    let exchange
    try {
        exchange = getExchange(exchangeId)
    } catch {
        console.error(`Unknown exchange: ${exchangeId}`)
        process.exit(1)
    }

    let symbol
    try {
        symbol = exchange.getSymbol(symbolId)
    } catch {
        console.error(`Unknown symbol: ${symbolId} on ${exchangeId}`)
        console.error(`Available: ${exchange.symbols.map(s => s.pairId).join(', ')}`)
        process.exit(1)
    }

    const start = args[2] ? parseDate(args[2]) : { year: 2024, month: 1, day: 1 }
    const end = args[3] ? parseDate(args[3]) : yesterday()

    console.log(`Fetching ${symbol} from ${exchange.id}`)
    console.log(`Range: ${fmtDate(start)} to ${fmtDate(end)}`)

    const store = new TradeStore('data', symbol)
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
