import { parentPort, workerData } from 'worker_threads'
import TradeOutcome from '../core/TradeOutcome.js'
import Trades from './Trades.js'
import { resolveExchangeAndSymbol } from '../utils/cli.js'
import { nextDay } from '../utils/date.js'

const { dataDir, exchangeId, pairId, year, month, day, startIndex, chunkSize, tpPercent, slPercent } = workerData

const { symbol } = resolveExchangeAndSymbol(exchangeId, pairId)
const tradeStore = new Trades(dataDir, symbol)

const trades = await tradeStore.readArrayAsync(year, month, day, year, month, day)
const daySize = trades.length
const dayStartUs = trades[0]?.tsUs || 0
const wantedTrades = trades.slice(startIndex, startIndex + chunkSize)
let scanningTrades = trades.slice(startIndex)

const outcomes = []
const pending = []
const lastWantedTradeUs = wantedTrades.at(-1)?.tsUs || 0
let localCurrentDay = { year, month, day }

const progressInfo = {
    day: {
        startUs: dayStartUs,
        size: daySize
    },
    requestedChunk: { start: wantedTrades[0]?.tsUs, end: lastWantedTradeUs, count: wantedTrades.length },
    scanningChunk: { start: scanningTrades[0]?.tsUs, end: scanningTrades.at(-1)?.tsUs, count: scanningTrades.length },
    pendingTradesCount: 0,
    resolvedTradesCount: 0
}

const sendProgress = (updateScanningChunk = false) => {
    progressInfo.pendingTradesCount = pending.length
    progressInfo.resolvedTradesCount = outcomes.length - pending.length
    if (updateScanningChunk) {
        progressInfo.scanningChunk = { start: scanningTrades[0]?.tsUs, end: scanningTrades.at(-1)?.tsUs, count: scanningTrades.length }
    }
    parentPort.postMessage({ type: 'progress', data: progressInfo })
}

while (true) {
    for (let i = 0; i < scanningTrades.length; i++) {
        const trade = scanningTrades[i]

        if (trade.tsUs <= lastWantedTradeUs) {
            const outcome = new TradeOutcome({
                tpPercent,
                slPercent,
                trade
            })
            outcomes.push(outcome)
            pending.push(outcome)
        }

        for (let j = 0; j < pending.length; j++) {
            if (pending[j].update(trade)) {
                pending.splice(j, 1)
                j--
            }
        }

        if (pending.length === 0) break

        if (i % 10000 === 0) sendProgress(false)
    }
    if (pending.length === 0) break

    localCurrentDay = nextDay(localCurrentDay.year, localCurrentDay.month, localCurrentDay.day)
    scanningTrades = await tradeStore.readArrayAsync(localCurrentDay.year, localCurrentDay.month, localCurrentDay.day,
        localCurrentDay.year, localCurrentDay.month, localCurrentDay.day)
    sendProgress(true)

    if (scanningTrades.length === 0) break
}

sendProgress(false)

const completed = outcomes.filter(o => o.completed).map(o => ({
    openTsUs: o.longOrder.open.tsUs,
    openSrcId: o.longOrder.open.srcId,
    longCloseTsUs: o.longOrder.close.tsUs,
    longCloseSrcId: o.longOrder.close.srcId,
    shortCloseTsUs: o.shortOrder.close.tsUs,
    shortCloseSrcId: o.shortOrder.close.srcId
}))

parentPort.postMessage({ type: 'done', completed, pending: outcomes.length - completed.length })
