import Store from './Store.js'
import Day from '../utils/Day.js'
import Outcome, { OutcomeRef } from '../core/Outcome.js'
import Candle, { fromCandleRef } from '../core/Candle.js'

export default class Outcomes extends Store {
    #tpPercent
    #slPercent
    #tradesStore
    #candlesStore

    constructor (dataDir, symbol, tpPercent, slPercent, tradesStore, candlesStore) {
        super(dataDir, symbol, 'outcomes', OutcomeRef.RECORD_SIZE, [`${tpPercent}`, `${slPercent}`])
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
        this.#tradesStore = tradesStore
        this.#candlesStore = candlesStore
    }

    #containsPrice (candle, outcome) {
        if (outcome.completed) { return false }
        if (!outcome.longOrder && candle.containsPrices(outcome.limits.long.tp, outcome.limits.long.sl)) { return true }
        if (!outcome.shortOrder && candle.containsPrices(outcome.limits.short.tp, outcome.limits.short.sl)) { return true }
        return false
    }

    async computeDayBuffer (dayTsUs) {
        const trades = this.#tradesStore.getDay(dayTsUs)
        const buf = Buffer.alloc(OutcomeRef.RECORD_SIZE * trades.length)
        let candles = this.#candlesStore.getDay(dayTsUs).map(ref => fromCandleRef(ref, this.#candlesStore.durationSec, this.#tradesStore))
        const outcome = new Outcome(this.#tpPercent, this.#slPercent, trades[0])
        const tradesFromStorageLimit = candles.at(-1).ordinal
        for (let i = 0; i < trades.length; i++) {
            if ((i % 5000) === 0) { console.log(`${i}`) }
            const trade = trades[i]
            outcome.reset(trade)
            const parentCandleOrdinal = Math.floor(trade.tsUs / (candles[0].durationSec * 1000000))
            const parentCandleIndex = parentCandleOrdinal - candles[0].ordinal
            const parentCandle = candles[parentCandleIndex]
            if (this.#containsPrice(parentCandle, outcome)) {
                if (outcome.multiUpdate(trades, trade.dayIndex + 1, parentCandle.close.dayIndex + 1)) {
                    OutcomeRef.writeRecord(buf, trade.dayIndex * OutcomeRef.RECORD_SIZE, outcome)
                    continue
                }
            }
            for (let ci = parentCandleIndex + 1; ci < candles.length; ci++) {
                const candle = candles[ci]
                if (!this.#containsPrice(candle, outcome)) continue
                if (candle.ordinal <= tradesFromStorageLimit) {
                    if (outcome.multiUpdate(trades, candle.open.dayIndex, candle.close.dayIndex + 1)) break
                } else {
                    const candleTrades = candle.getTrades(this.#tradesStore)
                    if (outcome.multiUpdate(candleTrades)) break
                }
            }
            if (outcome.completed) {
                OutcomeRef.writeRecord(buf, trade.dayIndex * OutcomeRef.RECORD_SIZE, outcome)
                continue
            }
            let nextDay = Day.nextDay(candles.at(-1).open.tsUs)
            while (true) {
                await this.#candlesStore.loadAsync(nextDay, nextDay)
                await this.#tradesStore.loadAsync(nextDay, nextDay)
                const newCandles = this.#candlesStore.getDay(nextDay).map(ref => fromCandleRef(ref, this.#candlesStore.durationSec, this.#tradesStore))
                if (!newCandles || newCandles.length === 0) throw new Error(`No more candle data available to resolve outcome for trade at tsUs=${trade.tsUs}`)
                candles = candles.concat(newCandles)
                for (const candle of newCandles) {
                    if (!this.#containsPrice(candle, outcome)) continue
                    const candleTrades = candle.getTrades(this.#tradesStore)
                    if (outcome.multiUpdate(candleTrades)) break
                }
                if (outcome.completed) {
                    OutcomeRef.writeRecord(buf, trade.dayIndex * OutcomeRef.RECORD_SIZE, outcome)
                    break
                }
                nextDay = Day.nextDay(nextDay)
            }
        }

        return buf
    }

    makeRecord (buf, offset, dayIndex, absoluteIndex) {
        return new OutcomeRef(buf.subarray(offset, offset + this.recordSize))
    }
}
