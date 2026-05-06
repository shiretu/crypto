import Store from './Store.js'
import CandleRef from '../core/CandleRef.js'
import Candle from '../core/Candle.js'
import Day from '../utils/Day.js'
import Trades from './Trades.js'

export default class CandleRefs extends Store {
    #targetDurationSec

    constructor (dataDir, symbol, targetDurationSec) {
        super(dataDir, symbol, 'candles', CandleRef.RECORD_SIZE, [`${targetDurationSec}`])
        this.#targetDurationSec = targetDurationSec
    }

    async computeDay (dayTsUs) {
        const trades = new Trades(this.dataDir, this.symbol)
        await trades.loadAsync(dayTsUs, dayTsUs)
        if (trades.count === 0) return Buffer.alloc(0)

        const durationUs = this.#targetDurationSec * 1_000_000
        const candles = []
        let current = null

        for (let i = 0; i < trades.count; i++) {
            const trade = trades.get(i)
            const ordinal = Math.floor(trade.tsUs / durationUs)
            if (current) {
                if (current.ordinal === ordinal) {
                    current.update(trade)
                } else {
                    current = new Candle(this.#targetDurationSec, trade)
                    candles.push(current)
                }
            } else {
                current = new Candle(this.#targetDurationSec, trade)
                candles.push(current)
            }
        }

        const buf = Buffer.alloc(CandleRef.RECORD_SIZE * candles.length)
        for (let i = 0; i < candles.length; i++) {
            CandleRef.writeRecord(buf, i * CandleRef.RECORD_SIZE, i, candles[i])
        }
        return buf
    }

    #makeRecord (buf, offset) {
        return new CandleRef(buf.subarray(offset, offset + this.recordSize))
    }

    getAt (tsUs, dayIndex) {
        const dayKey = Day.fromTsUs(tsUs)
        const buf = this.buffers.get(dayKey)
        if (!buf) throw new Error(`Day not loaded for tsUs=${tsUs}`)
        const offset = dayIndex * this.recordSize
        if (offset + this.recordSize > buf.length) throw new Error(`dayIndex ${dayIndex} out of bounds (day has ${buf.length / this.recordSize} records)`)
        return this.#makeRecord(buf, offset)
    }

    get (index) {
        let remaining = index
        for (let day = this.minDay; day <= this.maxDay; day += Day.usPerDay) {
            const buf = this.buffers.get(day)
            if (!buf) continue
            const dayCount = buf.length / this.recordSize
            if (remaining < dayCount) {
                return this.#makeRecord(buf, remaining * this.recordSize)
            }
            remaining -= dayCount
        }
        throw new Error(`Index ${index} out of bounds (store has ${this.count} records)`)
    }

    findByTsUs (tsUs) {
        const dayKey = Day.fromTsUs(tsUs)
        const buf = this.buffers.get(dayKey)
        if (!buf) throw new Error(`Day not loaded for tsUs=${tsUs}`)
        const count = buf.length / this.recordSize
        let lo = 0
        let hi = count - 1
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1
            const midTsUs = this.readTsUs(buf, mid * this.recordSize)
            if (midTsUs === tsUs) return this.#makeRecord(buf, mid * this.recordSize)
            if (midTsUs < tsUs) lo = mid + 1
            else hi = mid - 1
        }
        throw new Error(`No record found for tsUs=${tsUs}`)
    }
}
