export default class Trade {
    static RECORD_SIZE = 40

    #buf

    constructor (buf) {
        this.#buf = buf
    }

    get index () { return Number(this.#buf.readBigUInt64LE(0)) }
    get tsUs () { return Number(this.#buf.readBigUInt64LE(8) & 0x7FFFFFFFFFFFFFFFn) }
    get price () { return this.#buf.readDoubleLE(16) }
    get baseQty () { return this.#buf.readDoubleLE(24) }
    get quoteQty () { return this.#buf.readDoubleLE(32) }
    get isBuyerMaker () { return (Number(this.#buf.readBigUInt64LE(8) >> 63n) & 1) === 1 }

    static writeRecord (buf, offset, index, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
        buf.writeBigUInt64LE(BigInt(index), offset)
        const flag = isBuyerMaker ? 1n : 0n
        buf.writeBigUInt64LE(BigInt(tsUs) | (flag << 63n), offset + 8)
        buf.writeDoubleLE(price, offset + 16)
        buf.writeDoubleLE(baseQty, offset + 24)
        buf.writeDoubleLE(quoteQty, offset + 32)
    }
}
