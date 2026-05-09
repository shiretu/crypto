import Store from './Store.js'
import Candle, { CandleRef, toCandleRefBuffer } from '../core/Candle.js'
import Trades from './Trades.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

export default class Candles extends Store {
    #durationSec
    #tradesStore

    constructor (dataDir, symbol, durationSec, tradesStore) {
        super(dataDir, symbol, 'candles', CandleRef.RECORD_SIZE, [`${durationSec}`])
        this.#durationSec = durationSec
        this.#tradesStore = tradesStore
    }

    get durationSec () { return this.#durationSec }

    async computeDayBuffer (dayTsUs) {
        await this.#tradesStore.loadAsync(dayTsUs, dayTsUs)
        const dayEntry = this.#tradesStore.buffers.get(dayTsUs)
        if (!dayEntry || dayEntry.count === 0) return Buffer.alloc(0)

        const durationUs = this.#durationSec * 1_000_000
        const candles = []
        let current = null

        for (let i = 0; i < dayEntry.count; i++) {
            const trade = this.#tradesStore.get(dayEntry.absoluteStartIndex + i)
            const ordinal = Math.floor(trade.tsUs / durationUs)
            if (current && current.ordinal === ordinal) {
                current.update(trade)
            } else {
                current = new Candle(this.#durationSec, trade)
                candles.push(current)
            }
        }

        const buf = Buffer.alloc(CandleRef.RECORD_SIZE * candles.length)
        for (let i = 0; i < candles.length; i++) {
            CandleRef.writeRecord(buf, i * CandleRef.RECORD_SIZE, candles[i])
        }
        return buf
    }

    makeRecord (buf, offset, dayIndex, absoluteIndex) {
        return new CandleRef(buf.subarray(offset, offset + this.recordSize))
    }

    toAnonymousObject () {
        return { ...super.toAnonymousObject(), durationSec: this.#durationSec }
    }

    static fromAnonymousObject (obj, tradesStore) {
        const store = new Candles(obj.dataDir, resolveSymbol(obj.symbolId), obj.durationSec, tradesStore)
        store._restoreFrom(obj)
        return store
    }
}
