import Symbol from './Symbol.js'

export default class Trade {
    static RECORD_SIZE = 32

    #symbol
    #tsUs
    #price
    #baseQty
    #quoteQty
    #isBuyerMaker
    #srcId

    constructor (symbol, srcId, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
        if (!(symbol instanceof Symbol)) throw new Error('symbol must be a Symbol')
        if (!Number.isInteger(srcId) || srcId < 0) throw new Error('srcId must be a non-negative integer')
        this.#symbol = symbol
        this.#srcId = srcId
        this.#tsUs = tsUs
        this.#price = price
        this.#baseQty = baseQty
        this.#quoteQty = quoteQty
        this.#isBuyerMaker = isBuyerMaker
    }

    get symbol () { return this.#symbol }
    get srcId () { return this.#srcId }
    get tsUs () { return this.#tsUs }
    get price () { return this.#price }
    get baseQty () { return this.#baseQty }
    get quoteQty () { return this.#quoteQty }
    get isBuyerMaker () { return this.#isBuyerMaker }

    static fromBuffer (symbol, srcId, buf, offset) {
        if (!(symbol instanceof Symbol)) throw new Error('symbol must be a Symbol')
        const tsWithFlags = buf.readBigUInt64LE(offset)
        const tsUs = Number(tsWithFlags & 0x3FFFFFFFFFFFFFFFn)
        const isBuyerMaker = (Number(tsWithFlags >> 62n) & 1) === 1
        const price = buf.readDoubleLE(offset + 8)
        const baseQty = buf.readDoubleLE(offset + 16)
        const quoteQty = buf.readDoubleLE(offset + 24)
        return new Trade(symbol, srcId, tsUs, price, baseQty, quoteQty, isBuyerMaker)
    }

    static toBuffer (buf, offset, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
        const flags = isBuyerMaker ? 1n : 0n
        buf.writeBigUInt64LE(BigInt(tsUs) | (flags << 62n), offset)
        buf.writeDoubleLE(price, offset + 8)
        buf.writeDoubleLE(baseQty, offset + 16)
        buf.writeDoubleLE(quoteQty, offset + 24)
    }
}
