import TradeOutcomes from '../stores/TradeOutcomes.js'
import Trades from '../stores/Trades.js'
import CachedFile from '../utils/CachedFile.js'
import Day from '../utils/Day.js'
import { lastMonth } from './utils.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const usage = () => {
    console.error('Usage: getTradeOutcomes <symbol> <tpPercent> <slPercent> [YYYY-MM-DD] [YYYY-MM-DD]')
    console.error('  symbol    : exchange:base:quote (e.g. binance:btc:usdc)'))
    console.error('  tpPercent : take profit percent (e.g. 1.5)')
    console.error('  slPercent : stop loss percent (e.g. 1)')
    console.error('  start     : optional start date, defaults to last month')
    console.error('  end       : optional end date, defaults to last month')
    process.exit(1)
}

const main = async () => {
    const args = process.argv.slice(2)
    if (args.length < 3) usage()

    const symbol = resolveSymbol(args[0])
    const tpPercent = parseFloat(args[1])
    const slPercent = parseFloat(args[2])

    if (isNaN(tpPercent) || tpPercent <= 0) { console.error(`Invalid tpPercent: ${args[1]}`); process.exit(1) }
    if (isNaN(slPercent) || slPercent <= 0) { console.error(`Invalid slPercent: ${args[2]}`); process.exit(1) }

    const defaults = lastMonth()
    const start = args[3] ? Day.fromStr(args[3]) : defaults.start
    const end = args[4] ? Day.fromStr(args[4]) : defaults.end

    console.log(`TradeOutcomes TP=${tpPercent}% SL=${slPercent}% for ${symbol}`)
    console.log(`Range: ${Day.toStr(start)} to ${Day.toStr(end)}`)
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

    await store.fetchAsync(start, end)

    clearInterval(progressTimer)
    process.stdout.write('\x1b[H\x1b[J')

    let total = 0
    let longTp = 0
    let shortTp = 0

    for await (const outcome of store.readAsync(start, end)) {
        total++
        const lo = outcome.longOrder
        const so = outcome.shortOrder
        if (lo.profitPercent > 0) longTp++
        if (so.profitPercent > 0) shortTp++
        if (total % 100000 === 0) process.stderr.write(`\rReading outcomes: ${total}`)
    }
    if (total > 0) process.stderr.write(`\rReading outcomes: ${total}\n`)

    console.log(`Total outcomes: ${total}`)
    console.log(`Long  TP: ${longTp} (${(longTp / total * 100).toFixed(1)}%)  SL: ${total - longTp} (${((total - longTp) / total * 100).toFixed(1)}%)`)
    console.log(`Short TP: ${shortTp} (${(shortTp / total * 100).toFixed(1)}%)  SL: ${total - shortTp} (${((total - shortTp) / total * 100).toFixed(1)}%)`)
    const s = CachedFile.stats
    console.log(`CachedFile: ${s.reads} reads, ${s.cacheHits} cache hits`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
