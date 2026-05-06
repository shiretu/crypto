import CandleDuration from '../core/candleDuration.js'
import Candles from '../stores/Candles.js'
import Ema from '../instruments/Ema.js'
import Day from '../utils/Day.js'
import { lastMonth } from './utils.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const DURATION_NAMES = Object.entries(CandleDuration)
    .reduce((m, [k, v]) => { m[k.toLowerCase()] = v; m[String(v)] = v; return m }, {})

const usage = () => {
    console.error('Usage: getEma <symbol> <duration> <period> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  symbol    : exchange:base:quote (e.g. binance:btc:usdc)')
    console.error('  duration  : candle duration (e.g. min_1, hour_4)'))
    console.error('  period    : EMA period (e.g. 20)')
    console.error('  start     : optional start date, defaults to last month')
    console.error('  end       : optional end date, defaults to last month')
    console.error(`  valid durations: ${Object.keys(CandleDuration).join(', ')}`)
    process.exit(1)
}

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 3) usage()

    const symbol = resolveSymbol(args[0])
    const durationArg = args[1]
    const period = parseInt(args[2], 10)

    const durationSec = DURATION_NAMES[durationArg.toLowerCase()]
    if (!durationSec) {
        console.error(`Invalid duration: ${durationArg}`)
        process.exit(1)
    }
    if (!Number.isInteger(period) || period < 1) {
        console.error(`Invalid period: ${args[3]}`)
        process.exit(1)
    }

    const defaults = lastMonth()
    const start = args[3] ? Day.fromStr(args[3]) : defaults.start
    const end = args[4] ? Day.fromStr(args[4]) : defaults.end

    console.log(`EMA(${period}) on ${durationArg} candles for ${symbol}`)
    console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)
    console.log()

    const store = new Candles('data', symbol, durationSec)
    const ema = new Ema(period)

    for await (const candle of store.readAsync(start, end)) {
        const value = ema.update(candle.close.price)
        const openTime = new Date(candle.index * durationSec * 1000)
        const time = openTime.toISOString().replace('T', ' ').replace(/\.000Z$/, '')
        if (value !== null) {
            console.log(`${time}  close=${candle.close.price.toFixed(2)}  EMA=${value.toFixed(2)}`)
        }
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
