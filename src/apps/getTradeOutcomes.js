import TradeOutcomes from '../stores/TradeOutcomes.js'
import Trades from '../stores/Trades.js'
import FilePart from '../utils/FilePart.js'
import { parseDate, lastMonth, fmtDate } from '../utils/date.js'
import { resolveExchangeAndSymbol } from '../utils/cli.js'

const usage = () => {
    console.error('Usage: getTradeOutcomes <exchange> <symbol> <tpPercent> <slPercent> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  exchange  : exchange id (e.g. binance)')
    console.error('  symbol    : symbol pair id (e.g. btc:usdc)')
    console.error('  tpPercent : take profit percent (e.g. 1.5)')
    console.error('  slPercent : stop loss percent (e.g. 1)')
    console.error('  start     : optional start date, defaults to last month')
    console.error('  end       : optional end date, defaults to last month')
    process.exit(1)
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
    const start = args[4] ? parseDate(args[4]) : defaults.start
    const end = args[5] ? parseDate(args[5]) : defaults.end

    console.log(`TradeOutcomes TP=${tpPercent}% SL=${slPercent}% for ${symbol} from ${exchange.id}`)
    console.log(`Range: ${fmtDate(start)} to ${fmtDate(end)}`)
    console.log()

    const chunks = new Map()
    let currentDayStartUs = 0
    let dayTotal = 0
    let dayResolved = 0
    const onProgress = (p) => {
        if (p.day.startUs !== currentDayStartUs) {
            currentDayStartUs = p.day.startUs
            dayTotal = p.day.size
            dayResolved = 0
            chunks.clear()
        }
        if (p.resolvedTradesCount === p.requestedChunk.count) {
            dayResolved += p.requestedChunk.count
            chunks.delete(p.requestedChunk.start)
        } else {
            chunks.set(p.requestedChunk.start, p)
        }
    }

    const store = new TradeOutcomes('data', symbol, { tpPercent, slPercent, onProgress })

    const progressTimer = setInterval(() => {
        if (chunks.size === 0) return
        process.stderr.write('\x1b[H')
        const rows = []
        let totalWanted = 0
        let inFlightResolved = 0
        let inFlightPending = 0
        for (const [key, p] of [...chunks].sort((a, b) => a[0] - b[0])) {
            const pct = p.requestedChunk.count > 0 ? (p.resolvedTradesCount / p.requestedChunk.count * 100) : 0
            const barWidth = 20
            const filled = Math.round(pct / 100 * barWidth)
            const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled)
            const t = new Date(Math.floor(p.requestedChunk.start / 1000))
            const time = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}:${String(t.getUTCSeconds()).padStart(2, '0')}`
            rows.push({
                time,
                progress: bar,
                resolved: p.resolvedTradesCount,
                wanted: p.requestedChunk.count,
                pending: p.pendingTradesCount,
                scanning: p.scanningChunk.count
            })
            totalWanted += p.requestedChunk.count
            inFlightResolved += p.resolvedTradesCount
            inFlightPending += p.pendingTradesCount
        }
        const totalResolved = dayResolved + inFlightResolved
        const totalPct = dayTotal > 0 ? (totalResolved / dayTotal * 100) : 0
        const totalFilled = Math.min(20, Math.round(totalPct / 100 * 20))
        const d = new Date(Math.floor(currentDayStartUs / 1000))
        const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        const totalBar = '\u2588'.repeat(totalFilled) + '\u2591'.repeat(20 - totalFilled)
        rows.unshift({
            time: '',
            progress: totalBar,
            resolved: totalResolved,
            wanted: dayTotal,
            pending: inFlightPending,
            scanning: chunks.size + ' chunks'
        })
        process.stderr.write(`\x1b[K  ${label}  ${totalResolved}/${dayTotal} (${totalPct.toFixed(1)}%)  ${chunks.size} chunks\n`)
        console.table(rows)
        process.stderr.write('\x1b[J')
    }, 250)

    await store.fetchAsync(start.year, start.month, start.day, end.year, end.month, end.day)

    clearInterval(progressTimer)
    process.stderr.write('\x1b[H\x1b[J')

    let total = 0
    let longTp = 0
    let shortTp = 0

    for await (const outcome of store.readAsync(start.year, start.month, start.day, end.year, end.month, end.day)) {
        total++
        const lo = outcome.longOrder
        const so = outcome.shortOrder
        if (lo.profitPercent > 0) longTp++
        if (so.profitPercent > 0) shortTp++
    }

    console.log(`Total outcomes: ${total}`)
    console.log(`Long  TP: ${longTp} (${(longTp / total * 100).toFixed(1)}%)  SL: ${total - longTp} (${((total - longTp) / total * 100).toFixed(1)}%)`)
    console.log(`Short TP: ${shortTp} (${(shortTp / total * 100).toFixed(1)}%)  SL: ${total - shortTp} (${((total - shortTp) / total * 100).toFixed(1)}%)`)
    const s = FilePart.stats
    console.log(`FilePart: ${s.fullReads} full reads, ${s.partialReads} partial reads, ${s.upgrades} upgrades, ${s.cacheHits} cache hits`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
