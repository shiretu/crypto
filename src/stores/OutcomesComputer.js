import Outcome, { OutcomeRef } from '../core/Outcome.js'
import { fromCandleRef } from '../core/Candle.js'
import Day from '../utils/Day.js'
import Trades from './Trades.js'
import Candles from './Candles.js'

export default class OutcomesComputer {
    /**
     * Compute outcomes for a range of trades.
     * @param {Trade[]} trades - all trades for the day
     * @param {Candle[]} candles - hydrated candles (may grow if more days are needed)
     * @param {number} startIndex - first trade index to process (inclusive)
     * @param {number} endIndex - last trade index to process (exclusive)
     * @param {object} context - { dataDir, symbol, durationSec } for loading additional days
     * @returns {Promise<Buffer>}
     */
    static async compute ({ dataDir, symbol, tpPercent, slPercent, trades, candles, startIndex, endIndex, progressCallback }) {
        const localTradesStore = new Trades(dataDir, symbol)
        const localCandlesStore = new Candles(dataDir, symbol, candles[0].durationSec, localTradesStore)

        const loadMoreCandles = async (lastCandle) => {
            const nextDay = Day.nextDay(lastCandle.open.tsUs)
            await localTradesStore.loadAsync(nextDay, nextDay)
            await localCandlesStore.loadAsync(nextDay, nextDay)
            return localCandlesStore.getDay(nextDay).map(ref => fromCandleRef(ref, candles[0].durationSec, localTradesStore))
        }

        const containsPrices = (candle, outcome) => {
            if (outcome.completed) return false
            if (!outcome.longOrder && candle.containsPrices(outcome.limits.long.tp, outcome.limits.long.sl)) return true
            if (!outcome.shortOrder && candle.containsPrices(outcome.limits.short.tp, outcome.limits.short.sl)) return true
            return false
        }

        const emitProgress = (currentIndex) => {
            if (progressCallback) { progressCallback(currentIndex) }
        }

        const buf = Buffer.alloc(OutcomeRef.RECORD_SIZE * (endIndex - startIndex))
        let writeCursor = 0
        const outcome = new Outcome(tpPercent, slPercent, trades[startIndex])
        const durationUs = candles[0].durationSec * 1_000_000
        const firstOrdinal = candles[0].ordinal
        const tradesFromStorageLimit = candles.at(-1).ordinal

        for (let i = startIndex; i < endIndex; i++) {
            emitProgress(i)
            const trade = trades[i]
            outcome.reset(trade)

            const parentCandleIndex = Math.floor(trade.tsUs / durationUs) - firstOrdinal
            const parentCandle = candles[parentCandleIndex]

            if (containsPrices(parentCandle, outcome)) {
                if (outcome.multiUpdate(trades, trade.dayIndex + 1, parentCandle.close.dayIndex + 1)) {
                    OutcomeRef.writeRecord(buf, writeCursor * OutcomeRef.RECORD_SIZE, outcome)
                    writeCursor++
                    continue
                }
            }

            for (let ci = parentCandleIndex + 1; ci < candles.length; ci++) {
                const candle = candles[ci]
                if (!containsPrices(candle, outcome)) continue
                if (candle.ordinal <= tradesFromStorageLimit) {
                    if (outcome.multiUpdate(trades, candle.open.dayIndex, candle.close.dayIndex + 1)) break
                } else {
                    const candleTrades = candle.getTrades()
                    if (outcome.multiUpdate(candleTrades)) break
                }
            }

            if (outcome.completed) {
                OutcomeRef.writeRecord(buf, writeCursor * OutcomeRef.RECORD_SIZE, outcome)
                writeCursor++
                continue
            }

            // Need more candles from subsequent days
            while (true) {
                const newCandles = await loadMoreCandles(candles.at(-1))
                if (!newCandles || newCandles.length === 0) {
                    throw new Error(`No more candle data available to resolve outcome for trade at tsUs=${trade.tsUs}`)
                }
                candles = candles.concat(newCandles)
                for (const candle of newCandles) {
                    if (!containsPrices(candle, outcome)) continue
                    const candleTrades = candle.getTrades()
                    if (outcome.multiUpdate(candleTrades)) break
                }
                if (outcome.completed) {
                    OutcomeRef.writeRecord(buf, writeCursor * OutcomeRef.RECORD_SIZE, outcome)
                    writeCursor++
                    break
                }
            }
        }

        return buf.subarray(0, writeCursor * OutcomeRef.RECORD_SIZE)
    }
}
