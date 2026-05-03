import { getExchange } from '../exchanges/index.js'
import CandleDuration from '../core/CandleDuration.js'
import CandleStore from '../sources/CandleStore.js'

const DURATION_NAMES = Object.entries(CandleDuration)
    .reduce((m, [k, v]) => { m[k.toLowerCase()] = v; m[String(v)] = v; return m }, {})

const usage = () => {
    console.error('Usage: getCandles <exchange> <symbol> <duration> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  exchange  : exchange id (e.g. binance)')
    console.error('  symbol    : symbol pair id (e.g. btc:usdc)')
    console.error('  duration  : candle duration (e.g. min_1, hour_1, or seconds: 60, 3600)')
    console.error('  start     : optional start date (e.g. 2024-01-01), defaults to 2024-01-01')
    console.error('  end       : optional end date (e.g. 2024-06-30), defaults to yesterday')
    console.error(`  valid durations: ${Object.keys(CandleDuration).join(', ')}`)
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
    if (args.length < 3) usage()

    const exchangeId = args[0]
    const symbolId = args[1]
    const durationArg = args[2]

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

    const durationSec = DURATION_NAMES[durationArg.toLowerCase()]
    if (!durationSec) {
        console.error(`Invalid duration: ${durationArg}`)
        console.error(`Valid: ${Object.keys(CandleDuration).join(', ')}`)
        process.exit(1)
    }

    const start = args[3] ? parseDate(args[3]) : { year: 2024, month: 1, day: 1 }
    const end = args[4] ? parseDate(args[4]) : yesterday()

    console.log(`Building ${durationArg} candles for ${symbol} from ${exchange.id}`)
    console.log(`Range: ${fmtDate(start)} to ${fmtDate(end)}`)

    const store = new CandleStore('data', symbol, durationSec)

    let totalCandles = 0
    for await (const candle of store.readCandles(start.year, start.month, start.day, end.year, end.month, end.day)) {
        totalCandles++
    }

    console.log(`Done. ${totalCandles} candles.`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
