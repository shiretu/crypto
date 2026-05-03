import Symbol from './Symbol.js'

export default class Trade {
    static RECORD_SIZE = 40

    #symbol
    #id
    #tsUs
    #price
    #baseQty
    #quoteQty
    #isBuyerMaker

    constructor (symbol, id, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
        if (!(symbol instanceof Symbol)) throw new Error('symbol must be a Symbol')
        this.#symbol = symbol
        this.#id = id
        this.#tsUs = tsUs
        this.#price = price
        this.#baseQty = baseQty
        this.#quoteQty = quoteQty
        this.#isBuyerMaker = isBuyerMaker
    }

    get symbol () { return this.#symbol }
    get id () { return this.#id }
    get tsUs () { return this.#tsUs }
    get price () { return this.#price }
    get baseQty () { return this.#baseQty }
    get quoteQty () { return this.#quoteQty }
    get isBuyerMaker () { return this.#isBuyerMaker }

    get tsMs () {
        return Math.floor(this.#tsUs / 1000)
    }

    get date () {
        return new Date(this.tsMs)
    }

    static fromBuffer (symbol, buf, offset) {
        if (!(symbol instanceof Symbol)) throw new Error('symbol must be a Symbol')
        const idWithFlags = buf.readBigUInt64LE(offset)
        const id = Number(idWithFlags & 0x3FFFFFFFFFFFFFFFn)
        const isBuyerMaker = (Number(idWithFlags >> 62n) & 1) === 1
        const tsUs = Number(buf.readBigUInt64LE(offset + 8))
        const price = buf.readDoubleLE(offset + 16)
        const baseQty = buf.readDoubleLE(offset + 24)
        const quoteQty = buf.readDoubleLE(offset + 32)
        return new Trade(symbol, id, tsUs, price, baseQty, quoteQty, isBuyerMaker)
    }

    static toBuffer (buf, offset, id, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
        const flags = isBuyerMaker ? 1n : 0n
        buf.writeBigUInt64LE(BigInt(id) | (flags << 62n), offset)
        buf.writeBigUInt64LE(BigInt(tsUs), offset + 8)
        buf.writeDoubleLE(price, offset + 16)
        buf.writeDoubleLE(baseQty, offset + 24)
        buf.writeDoubleLE(quoteQty, offset + 32)
    }
}
