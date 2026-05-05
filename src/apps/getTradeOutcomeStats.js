import TradeOutcomes from '../stores/TradeOutcomes.js'
import Trades from '../stores/Trades.js'
import Day from '../utils/Day.js'
import { lastMonth } from './utils.js'
import { resolveExchangeAndSymbol } from '../utils/cli.js'

const usage = () => {
    console.error('Usage: getTradeOutcomeStats <exchange> <symbol> <tpPercent> <slPercent> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  exchange  : exchange id (e.g. binance)')
    console.error('  symbol    : symbol pair id (e.g. btc:usdc)')
    console.error('  tpPercent : take profit percent (e.g. 1.5)')
    console.error('  slPercent : stop loss percent (e.g. 1)')
    console.error('  start     : optional start date, defaults to last month')
    console.error('  end       : optional end date, defaults to last month')
    process.exit(1)
}

const usToMin = (us) => (us / 1_000_000 / 60)
const fmtDuration = (us) => {
    const totalSec = Math.floor(us / 1_000_000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 4) usage()

    const { exchange, symbol } = resolveExchangeAndSymbol(args[0], args[1])
    const tpPercent = parseFloat(args[2])
    const slPercent = parseFloat(args[3])

    if (isNaN(tpPercent) || tpPercent <= 0) { console.error(`Invalid tpPercent: ${args[2]}`); process.exit(1) }
    if (isNaN(slPercent) || slPercent <= 0) { console.error(`Invalid slPercent: ${args[3]}`); process.exit(1) }

    const defaults = lastMonth()
    const start = args[4] ? Day.fromStr(args[4]) : defaults.start
    const end = args[5] ? Day.fromStr(args[5]) : defaults.end

    console.log(`TradeOutcome Stats TP=${tpPercent}% SL=${slPercent}% for ${symbol} from ${exchange.id}`)
    console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)
    console.log()

    const tradeStore = new Trades('data', symbol)
    await tradeStore.fetchAsync(start, end)

    const store = new TradeOutcomes('data', symbol, { tpPercent, slPercent })
    await store.fetchAsync(start, end)

    // Collect per-day and overall stats
    const days = new Map()
    let total = 0
    let longTp = 0; let shortTp = 0
    let longDurSum = 0; let shortDurSum = 0
    let longDurMin = Infinity; let longDurMax = 0
    let shortDurMin = Infinity; let shortDurMax = 0
    const longProfits = []
    const shortProfits = []
    const longDurations = []
    const shortDurations = []

    for await (const outcome of store.readAsync(start, end)) {
        total++
        const lo = outcome.longOrder
        const so = outcome.shortOrder
        const longWin = lo.profitPercent > 0
        const shortWin = so.profitPercent > 0
        if (longWin) longTp++
        if (shortWin) shortTp++

        longProfits.push(lo.profitPercent)
        shortProfits.push(so.profitPercent)

        const lDur = lo.durationUs
        const sDur = so.durationUs
        longDurSum += lDur
        shortDurSum += sDur
        longDurations.push(lDur)
        shortDurations.push(sDur)
        if (lDur < longDurMin) longDurMin = lDur
        if (lDur > longDurMax) longDurMax = lDur
        if (sDur < shortDurMin) shortDurMin = sDur
        if (sDur > shortDurMax) shortDurMax = sDur

        // Per-day tracking
        const dayKey = Day.toStr(Day.fromTsUs(lo.open.tsUs))
        let day = days.get(dayKey)
        if (!day) {
            day = { count: 0, longTp: 0, shortTp: 0, longDurSum: 0, shortDurSum: 0 }
            days.set(dayKey, day)
        }
        day.count++
        if (longWin) day.longTp++
        if (shortWin) day.shortTp++
        day.longDurSum += lDur
        day.shortDurSum += sDur
    }

    if (total === 0) { console.log('No outcomes found.'); return }

    // Overall win rates
    const pct = (n, d) => (n / d * 100).toFixed(1)
    console.log('=== Win Rates ===')
    console.log(`Total outcomes: ${total}`)
    console.log(`Long  TP: ${longTp} (${pct(longTp, total)}%)  SL: ${total - longTp} (${pct(total - longTp, total)}%)`)
    console.log(`Short TP: ${shortTp} (${pct(shortTp, total)}%)  SL: ${total - shortTp} (${pct(total - shortTp, total)}%)`)
    console.log()

    // Duration stats
    longDurations.sort((a, b) => a - b)
    shortDurations.sort((a, b) => a - b)
    const lp95 = longDurations[Math.floor(0.95 * longDurations.length)]
    const sp95 = shortDurations[Math.floor(0.95 * shortDurations.length)]
    console.log('=== Duration ===')
    console.log(`Long  avg: ${fmtDuration(longDurSum / total)}  min: ${fmtDuration(longDurMin)}  p95: ${fmtDuration(lp95)}  max: ${fmtDuration(longDurMax)}`)
    console.log(`Short avg: ${fmtDuration(shortDurSum / total)}  min: ${fmtDuration(shortDurMin)}  p95: ${fmtDuration(sp95)}  max: ${fmtDuration(shortDurMax)}`)
    console.log()

    // Profit distribution
    const histogram = (values, label) => {
        const sorted = [...values].sort((a, b) => a - b)
        const p = (i) => sorted[Math.floor(i / 100 * sorted.length)]
        console.log(`${label}:  min=${sorted[0].toFixed(3)}%  p10=${p(10).toFixed(3)}%  p25=${p(25).toFixed(3)}%  median=${p(50).toFixed(3)}%  p75=${p(75).toFixed(3)}%  p90=${p(90).toFixed(3)}%  max=${sorted.at(-1).toFixed(3)}%`)
    }
    console.log('=== Profit Distribution ===')
    histogram(longProfits, 'Long ')
    histogram(shortProfits, 'Short')
    console.log()

    // Daily summary table
    console.log('=== Daily Summary ===')
    const dailyRows = []
    for (const [dayKey, d] of [...days].sort((a, b) => a[0].localeCompare(b[0]))) {
        dailyRows.push({
            date: dayKey,
            count: d.count,
            'L win': d.longTp,
            'L loss': d.count - d.longTp,
            'L %': pct(d.longTp, d.count),
            'S win': d.shortTp,
            'S loss': d.count - d.shortTp,
            'S %': pct(d.shortTp, d.count),
            'avg L dur': fmtDuration(d.longDurSum / d.count),
            'avg S dur': fmtDuration(d.shortDurSum / d.count)
        })
    }
    console.table(dailyRows)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
