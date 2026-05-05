import CandleDuration from '../core/candleDuration.js'
import Candles from '../stores/Candles.js'
import CachedFile from '../utils/CachedFile.js'
import Day from '../utils/Day.js'
import { lastMonth } from './utils.js'
import { resolveExchangeAndSymbol } from '../utils/cli.js'

const DURATION_NAMES = Object.entries(CandleDuration)
    .reduce((m, [k, v]) => { m[k.toLowerCase()] = v; m[String(v)] = v; return m }, {})

const usage = () => {
    console.error('Usage: getCandles <exchange> <symbol> <duration> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  exchange  : exchange id (e.g. binance)')
    console.error('  symbol    : symbol pair id (e.g. btc:usdc)')
    console.error('  duration  : candle duration (e.g. min_1, hour_1, or seconds: 60, 3600)')
    console.error('  start     : optional start date (e.g. 2024-01-01), defaults to last month')
    console.error('  end       : optional end date (e.g. 2024-06-30), defaults to last month')
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

    const defaults = lastMonth()
    const start = args[3] ? Day.fromStr(args[3]) : defaults.start
    const end = args[4] ? Day.fromStr(args[4]) : defaults.end

    console.log(`Building ${durationArg} candles for ${symbol} from ${exchange.id}`)
    console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)

    const store = new Candles('data', symbol, durationSec)

    let totalCandles = 0
    for await (const candle of store.readAsync(start, end)) {
        totalCandles++
    }

    console.log(`Done. ${totalCandles} candles.`)
    const s = CachedFile.stats
    console.log(`CachedFile: ${s.reads} reads, ${s.cacheHits} cache hits`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
