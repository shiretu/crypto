export default class CandleRef {
    static RECORD_SIZE = 72

    #buf

    constructor (buf) {
        this.#buf = buf
    }

    get index () { return Number(this.#buf.readBigUInt64LE(0)) }
    get openTsUs () { return Number(this.#buf.readBigUInt64LE(8)) }
    get openIndex () { return Number(this.#buf.readBigUInt64LE(16)) }
    get closeTsUs () { return Number(this.#buf.readBigUInt64LE(24)) }
    get closeIndex () { return Number(this.#buf.readBigUInt64LE(32)) }
    get highTsUs () { return Number(this.#buf.readBigUInt64LE(40)) }
    get highIndex () { return Number(this.#buf.readBigUInt64LE(48)) }
    get lowTsUs () { return Number(this.#buf.readBigUInt64LE(56)) }
    get lowIndex () { return Number(this.#buf.readBigUInt64LE(64)) }

    static writeRecord (buf, offset, index, candle) {
        buf.writeBigUInt64LE(BigInt(index), offset)
        buf.writeBigUInt64LE(BigInt(candle.open.tsUs), offset + 8)
        buf.writeBigUInt64LE(BigInt(candle.open.index), offset + 16)
        buf.writeBigUInt64LE(BigInt(candle.close.tsUs), offset + 24)
        buf.writeBigUInt64LE(BigInt(candle.close.index), offset + 32)
        buf.writeBigUInt64LE(BigInt(candle.high.tsUs), offset + 40)
        buf.writeBigUInt64LE(BigInt(candle.high.index), offset + 48)
        buf.writeBigUInt64LE(BigInt(candle.low.tsUs), offset + 56)
        buf.writeBigUInt64LE(BigInt(candle.low.index), offset + 64)
    }
}
