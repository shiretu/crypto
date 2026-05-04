import TradeOutcomes from '../stores/TradeOutcomes.js'
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
    let lastPrint = 0
    const onProgress = (p) => {
        chunks.set(p.requestedChunk.start, {
            wanted: p.requestedChunk.count,
            pending: p.pendingTradesCount,
            resolved: p.resolvedTradesCount
        })
        const now = Date.now()
        if (now - lastPrint < 500) return
        lastPrint = now
        let totalWanted = 0
        let totalPending = 0
        let totalResolved = 0
        for (const c of chunks.values()) {
            totalWanted += c.wanted
            totalPending += c.pending
            totalResolved += c.resolved
        }
        process.stderr.write(`\r  ${chunks.size} chunks, wanted ${totalWanted}, pending ${totalPending}, resolved ${totalResolved}`)
    }

    const store = new TradeOutcomes('data', symbol, { tpPercent, slPercent, onProgress })

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

    console.log()
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
