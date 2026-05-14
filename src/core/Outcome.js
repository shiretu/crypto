import { LongOrder, ShortOrder } from './Order.js'

export default class Outcome {
    #tpPercent
    #slPercent
    #openTrade
    #longTrade
    #shortTrade
    #limits

    constructor (tpPercent, slPercent, openTrade) {
        if (tpPercent <= 0) throw new Error('tpPercent must be positive')
        if (slPercent <= 0) throw new Error('slPercent must be positive')
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
        this.reset(openTrade)
    }

    reset (openTrade) {
        this.#openTrade = openTrade
        this.#longTrade = null
        this.#shortTrade = null
        this.#limits = null
    }

    get completed () { return this.#longTrade !== null && this.#shortTrade !== null }
    get openTrade () { return this.#openTrade }
    get longTrade () { return this.#longTrade }
    get shortTrade () { return this.#shortTrade }
    get longOrder () { return this.#longTrade ? new LongOrder(this.#openTrade, this.#longTrade) : null }
    get shortOrder () { return this.#shortTrade ? new ShortOrder(this.#openTrade, this.#shortTrade) : null }
    get limits () {
        if (!this.#limits) {
            this.#limits = {
                long: {
                    tp: this.#openTrade.price * (1 + this.#tpPercent / 100),
                    sl: this.#openTrade.price * (1 - this.#slPercent / 100)
                },
                short: {
                    tp: this.#openTrade.price * (1 - this.#tpPercent / 100),
                    sl: this.#openTrade.price * (1 + this.#slPercent / 100)
                }
            }
        }
        return this.#limits
    }

    update (trade) {
        if (this.completed || trade.tsUs <= this.#openTrade.tsUs) return this.completed
        const price = trade.price
        const limits = this.limits

        if (this.#longTrade === null) {
            if (price >= limits.long.tp || price <= limits.long.sl) {
                this.#longTrade = trade
            }
        }

        if (this.#shortTrade === null) {
            if (price <= limits.short.tp || price >= limits.short.sl) {
                this.#shortTrade = trade
            }
        }

        return this.completed
    }

    multiUpdate (trades, start = 0, end = trades.length) {
        for (let i = start; i < end; i++) {
            if (this.update(trades[i])) return true
        }
        return this.completed
    }

    static fromTrades (tpPercent, slPercent, openTrade, longTrade, shortTrade) {
        const outcome = new Outcome(tpPercent, slPercent, openTrade)
        outcome.#longTrade = longTrade
        outcome.#shortTrade = shortTrade
        return outcome
    }
}

/**
 * OutcomeRef record layout (48 bytes):
 *   [0]  openTsUs      - UInt64LE - open trade timestamp
 *   [8]  openDayIndex  - UInt64LE - open trade day-relative index
 *   [16] longTsUs      - UInt64LE - long close trade timestamp
 *   [24] longDayIndex  - UInt64LE - long close trade day-relative index
 *   [32] shortTsUs     - UInt64LE - short close trade timestamp
 *   [40] shortDayIndex - UInt64LE - short close trade day-relative index
 */
export class OutcomeRef {
    static RECORD_SIZE = 48

    #buf

    constructor (buf) {
        this.#buf = buf
    }

    get openTsUs () { return Number(this.#buf.readBigUInt64LE(0)) }
    get openDayIndex () { return Number(this.#buf.readBigUInt64LE(8)) }
    get longTsUs () { return Number(this.#buf.readBigUInt64LE(16)) }
    get longDayIndex () { return Number(this.#buf.readBigUInt64LE(24)) }
    get shortTsUs () { return Number(this.#buf.readBigUInt64LE(32)) }
    get shortDayIndex () { return Number(this.#buf.readBigUInt64LE(40)) }

    static writeRecord (buf, offset, outcome) {
        buf.writeBigUInt64LE(BigInt(outcome.openTrade.tsUs), offset)
        buf.writeBigUInt64LE(BigInt(outcome.openTrade.dayIndex), offset + 8)
        buf.writeBigUInt64LE(BigInt(outcome.longOrder.close.tsUs), offset + 16)
        buf.writeBigUInt64LE(BigInt(outcome.longOrder.close.dayIndex), offset + 24)
        buf.writeBigUInt64LE(BigInt(outcome.shortOrder.close.tsUs), offset + 32)
        buf.writeBigUInt64LE(BigInt(outcome.shortOrder.close.dayIndex), offset + 40)
    }
}

/**
 * Hydrate an OutcomeRef into an Outcome using a trades store.
 * @param {OutcomeRef} ref
 * @param {number} tpPercent
 * @param {number} slPercent
 * @param {object} tradesStore
 * @returns {Outcome}
 */
export const fromOutcomeRef = (ref, tpPercent, slPercent, tradesStore) => {
    const open = tradesStore.getAt(ref.openTsUs, ref.openDayIndex)
    const long = tradesStore.getAt(ref.longTsUs, ref.longDayIndex)
    const short = tradesStore.getAt(ref.shortTsUs, ref.shortDayIndex)
    return Outcome.fromTrades(tpPercent, slPercent, open, long, short)
}
