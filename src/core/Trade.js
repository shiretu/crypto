export default class Trade {
    static RECORD_SIZE = 32

    #buf
    #dayIndex
    #absoluteIndex

    constructor (buf, dayIndex, absoluteIndex) {
        this.#buf = buf
        this.#dayIndex = dayIndex
        this.#absoluteIndex = absoluteIndex
    }

    get dayIndex () { return this.#dayIndex }
    get absoluteIndex () { return this.#absoluteIndex }
    get tsUs () { return Number(this.#buf.readBigUInt64LE(0) & 0x7FFFFFFFFFFFFFFFn) }
    get price () { return this.#buf.readDoubleLE(8) }
    get baseQty () { return this.#buf.readDoubleLE(16) }
    get quoteQty () { return this.#buf.readDoubleLE(24) }
    get isBuyerMaker () { return (Number(this.#buf.readBigUInt64LE(0) >> 63n) & 1) === 1 }

    static writeRecord (buf, offset, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
        const flag = isBuyerMaker ? 1n : 0n
        buf.writeBigUInt64LE(BigInt(tsUs) | (flag << 63n), offset)
        buf.writeDoubleLE(price, offset + 8)
        buf.writeDoubleLE(baseQty, offset + 16)
        buf.writeDoubleLE(quoteQty, offset + 24)
    }
}
