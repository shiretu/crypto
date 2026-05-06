export default class Trade {
    static RECORD_SIZE = 32

    #buf

    constructor (buf) {
        this.#buf = buf
    }

    get tsUs () { return Number(this.#buf.readBigUInt64LE(0) & 0x7FFFFFFFFFFFFFFFn) }
    get price () { return this.#buf.readDoubleLE(8) }
    get baseQty () { return this.#buf.readDoubleLE(16) }
    get quoteQty () { return this.#buf.readDoubleLE(24) }
    get isBuyerMaker () { return (Number(this.#buf.readBigUInt64LE(0) >> 63n) & 1) === 1 }
}
