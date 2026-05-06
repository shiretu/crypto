import CandleDuration from '../core/candleDuration.js'
import Candles from '../stores/Candles.js'
import Macd from '../instruments/Macd.js'
import Day from '../utils/Day.js'
import { lastMonth } from './utils.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const DURATION_NAMES = Object.entries(CandleDuration)
    .reduce((m, [k, v]) => { m[k.toLowerCase()] = v; m[String(v)] = v; return m }, {})

const usage = () => {
    console.error('Usage: getMacd <symbol> <duration> [fast] [slow] [signal] [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  symbol    : exchange:base:quote (e.g. binance:btc:usdc)')
    console.error('  duration  : candle duration (e.g. min_1, hour_4)'))
    console.error('  fast      : fast EMA period (default 12)')
    console.error('  slow      : slow EMA period (default 26)')
    console.error('  signal    : signal EMA period (default 9)')
    console.error('  start     : optional start date, defaults to last month')
    console.error('  end       : optional end date, defaults to last month')
    console.error(`  valid durations: ${Object.keys(CandleDuration).join(', ')}`)
    process.exit(1)
}

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 2) usage()

    const symbol = resolveSymbol(args[0])
    const durationArg = args[1]

    const durationSec = DURATION_NAMES[durationArg.toLowerCase()]
    if (!durationSec) {
        console.error(`Invalid duration: ${durationArg}`)
        process.exit(1)
    }

    const fast = args[2] ? parseInt(args[2], 10) : 12
    const slow = args[3] ? parseInt(args[3], 10) : 26
    const signal = args[4] ? parseInt(args[4], 10) : 9
    const defaults = lastMonth()
    const start = args[5] ? Day.fromStr(args[5]) : defaults.start
    const end = args[6] ? Day.fromStr(args[6]) : defaults.end

    console.log(`MACD(${fast},${slow},${signal}) on ${durationArg} candles for ${symbol}`)
    console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)
    console.log()

    const store = new Candles('data', symbol, durationSec)
    const macd = new Macd({ fast, slow, signal })

    for await (const candle of store.readAsync(start, end)) {
        macd.update(candle.close.price)
        const openTime = new Date(candle.index * durationSec * 1000)
        const time = openTime.toISOString().replace('T', ' ').replace(/\.000Z$/, '')
        if (macd.isReady) {
            const v = macd.value
            console.log(`${time}  close=${candle.close.price.toFixed(2)}  MACD=${v.macd.toFixed(2)}  signal=${v.signal.toFixed(2)}  hist=${v.histogram.toFixed(2)}`)
        }
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
