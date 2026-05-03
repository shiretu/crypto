import CandleDuration from '../core/CandleDuration.js'
import Candles from '../stores/Candles.js'
import { parseDate, yesterday, fmtDate } from '../utils/date.js'
import { resolveExchangeAndSymbol } from '../utils/cli.js'

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

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 3) usage()

    const { exchange, symbol } = resolveExchangeAndSymbol(args[0], args[1])
    const durationArg = args[2]

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

    const store = new Candles('data', symbol, durationSec)

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
