import Trade from './Trade.js'
import { isValidDuration } from './CandleDuration.js'

export default class Candle {
    #durationSec
    #ordinal
    #open
    #close
    #high
    #low
    #trades

    static #EMPTY = Symbol('empty')

    static empty (durationSec, ordinal) {
        const candle = new Candle(durationSec, Candle.#EMPTY)
        candle.#ordinal = ordinal
        return candle
    }

    constructor (durationSec, firstTrade) {
        if (!isValidDuration(durationSec)) throw new Error(`Invalid candle duration: ${durationSec}`)
        this.#durationSec = durationSec
        this.#trades = null
        if (firstTrade === Candle.#EMPTY) {
            this.#ordinal = 0
            this.#open = null
            this.#close = null
            this.#high = null
            this.#low = null
            return
        }
        if (!(firstTrade instanceof Trade)) throw new Error('firstTrade must be a Trade')
        this.#ordinal = Math.floor(firstTrade.tsUs / (durationSec * 1_000_000))
        this.#open = firstTrade
        this.#close = firstTrade
        this.#high = firstTrade
        this.#low = firstTrade
    }

    get durationSec () { return this.#durationSec }
    get ordinal () { return this.#ordinal }
    get open () { return this.#open }
    get close () { return this.#close }
    get high () { return this.#high }
    get low () { return this.#low }
    get isEmpty () { return this.#open === null || this.#close === null || this.#high === null || this.#low === null }

    update (trade) {
        if (!(trade instanceof Trade)) throw new Error('trade must be a Trade')
        if (trade.tsUs < this.#close.tsUs) {
            throw new Error(`Trade timestamp ${trade.tsUs} is earlier than last trade ${this.#close.tsUs}`)
        }
        this.#close = trade
        if (trade.price > this.#high.price) this.#high = trade
        if (trade.price < this.#low.price) this.#low = trade
    }

    static fromOHLC (durationSec, open, high, low, close) {
        const candle = new Candle(durationSec, open)
        candle.#close = close
        candle.#high = high
        candle.#low = low
        return candle
    }

    getTrades (tradesStore) {
        if (!this.#trades) {
            this.#trades = tradesStore.getDay(this.#open.tsUs).slice(this.#open.dayIndex, this.#close.dayIndex + 1)
        }
        return this.#trades
    }

    containsPrices (dipsBelow, crossesOver) {
        if (this.isEmpty) return false
        return this.#low.price <= dipsBelow || this.#high.price >= crossesOver
    }
}

/**
 * CandleRef record layout (64 bytes):
 *   [0]  openTsUs      - UInt64LE - open trade timestamp
 *   [8]  openDayIndex  - UInt64LE - open trade day-relative index
 *   [16] closeTsUs     - UInt64LE - close trade timestamp
 *   [24] closeDayIndex - UInt64LE - close trade day-relative index
 *   [32] highTsUs      - UInt64LE - high trade timestamp
 *   [40] highDayIndex  - UInt64LE - high trade day-relative index
 *   [48] lowTsUs       - UInt64LE - low trade timestamp
 *   [56] lowDayIndex   - UInt64LE - low trade day-relative index
 */
export class CandleRef {
    static RECORD_SIZE = 64

    #buf

    constructor (buf) {
        this.#buf = buf
    }

    get openTsUs () { return Number(this.#buf.readBigUInt64LE(0)) }
    get openDayIndex () { return Number(this.#buf.readBigUInt64LE(8)) }
    get closeTsUs () { return Number(this.#buf.readBigUInt64LE(16)) }
    get closeDayIndex () { return Number(this.#buf.readBigUInt64LE(24)) }
    get highTsUs () { return Number(this.#buf.readBigUInt64LE(32)) }
    get highDayIndex () { return Number(this.#buf.readBigUInt64LE(40)) }
    get lowTsUs () { return Number(this.#buf.readBigUInt64LE(48)) }
    get lowDayIndex () { return Number(this.#buf.readBigUInt64LE(56)) }

    static writeRecord (buf, offset, candle) {
        if (candle.isEmpty) {
            buf.writeBigUInt64LE(0n, offset)
            buf.writeBigUInt64LE(BigInt(candle.ordinal), offset + 8)
            buf.writeBigUInt64LE(0n, offset + 16)
            buf.writeBigUInt64LE(0n, offset + 24)
            buf.writeBigUInt64LE(0n, offset + 32)
            buf.writeBigUInt64LE(0n, offset + 40)
            buf.writeBigUInt64LE(0n, offset + 48)
            buf.writeBigUInt64LE(0n, offset + 56)
            return
        }
        buf.writeBigUInt64LE(BigInt(candle.open.tsUs), offset)
        buf.writeBigUInt64LE(BigInt(candle.open.dayIndex), offset + 8)
        buf.writeBigUInt64LE(BigInt(candle.close.tsUs), offset + 16)
        buf.writeBigUInt64LE(BigInt(candle.close.dayIndex), offset + 24)
        buf.writeBigUInt64LE(BigInt(candle.high.tsUs), offset + 32)
        buf.writeBigUInt64LE(BigInt(candle.high.dayIndex), offset + 40)
        buf.writeBigUInt64LE(BigInt(candle.low.tsUs), offset + 48)
        buf.writeBigUInt64LE(BigInt(candle.low.dayIndex), offset + 56)
    }
}

/**
 * Serialize a Candle into a CandleRef buffer.
 * @param {Candle} candle
 * @returns {Buffer}
 */
export const toCandleRefBuffer = (candle) => {
    const buf = Buffer.alloc(CandleRef.RECORD_SIZE)
    CandleRef.writeRecord(buf, 0, candle)
    return buf
}

/**
 * Hydrate a CandleRef into a Candle using a trades store.
 * @param {CandleRef} ref
 * @param {number} durationSec
 * @param {object} tradesStore - must support getAt(tsUs, dayIndex)
 * @returns {Candle}
 */
export const fromCandleRef = (ref, durationSec, tradesStore) => {
    if (ref.openTsUs === 0) {
        return Candle.empty(durationSec, ref.openDayIndex)
    }
    const open = tradesStore.getAt(ref.openTsUs, ref.openDayIndex)
    const close = tradesStore.getAt(ref.closeTsUs, ref.closeDayIndex)
    const high = tradesStore.getAt(ref.highTsUs, ref.highDayIndex)
    const low = tradesStore.getAt(ref.lowTsUs, ref.lowDayIndex)
    return Candle.fromOHLC(durationSec, open, high, low, close)
}
