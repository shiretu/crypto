import { Buffer } from 'buffer'

// 7-byte ASCII magic at the start of every record. Lets us scan, recover,
// and binary-search a torn file without an external index.
export const MAGIC = Buffer.from('magic07', 'ascii')
export const MAGIC_LENGTH = MAGIC.length // 7
export const RECORD_HEADER_SIZE = 48
export const LEVEL_SIZE = 16 // i64 price + i64 qty

/**
 * Parse a wire price/qty string into a scaled BigInt.
 * scaleExp ∈ [0, 15]. Throws if the string has more decimals than scaleExp.
 */
export const encodeScaled = (wireStr, scaleExp) => {
    const [intPart, fracPart = ''] = wireStr.split('.')
    if (fracPart.length > scaleExp) {
        throw new Error(`value "${wireStr}" has more decimals than scaleExp=${scaleExp}`)
    }
    const padded = (fracPart + '0'.repeat(scaleExp)).slice(0, scaleExp)
    return BigInt(intPart) * (10n ** BigInt(scaleExp)) + BigInt(padded)
}

/**
 * Format a scaled BigInt back into a display string with trailing zeros stripped.
 */
export const decodeScaled = (n, scaleExp) => {
    const SCALE = 10n ** BigInt(scaleExp)
    const neg = n < 0n
    const abs = neg ? -n : n
    const intPart = abs / SCALE
    const fracDigits = (abs % SCALE).toString().padStart(scaleExp, '0').replace(/0+$/, '')
    return (neg ? '-' : '') + intPart + (fracDigits ? '.' + fracDigits : '')
}

export const recordSize = (bidCount, askCount) => RECORD_HEADER_SIZE + LEVEL_SIZE * (bidCount + askCount)

/**
 * Build a single record buffer (snapshot or delta).
 *
 * @param {Object}  rec
 * @param {boolean} rec.isDelta             - false = snapshot, true = delta
 * @param {number}  rec.scaleExp            - 0..15, encoded in byte 7 high nibble
 * @param {number|bigint} rec.emitUs        - server emit time, microseconds
 * @param {number|bigint} rec.prevSnapshotOffset - byte offset within day file
 * @param {number|bigint} rec.U             - first updateId in batch
 * @param {number|bigint} rec.u             - last updateId in batch
 * @param {Array<[bigint,bigint]>} rec.bids - [priceScaled, qtyScaled] pairs
 * @param {Array<[bigint,bigint]>} rec.asks
 * @returns {Buffer}
 */
export const writeRecord = ({ isDelta, scaleExp, emitUs, prevSnapshotOffset, U, u, bids, asks }) => {
    if (scaleExp < 0 || scaleExp > 15) throw new Error(`scaleExp out of range: ${scaleExp}`)
    if (bids.length > 0xffff || asks.length > 0xffff) {
        throw new Error(`level count overflow: bids=${bids.length} asks=${asks.length}`)
    }
    const size = recordSize(bids.length, asks.length)
    if (size % 8 !== 0) throw new Error(`record size ${size} not 8-aligned`)

    const buf = Buffer.allocUnsafe(size)
    MAGIC.copy(buf, 0)
    const sf = (scaleExp << 4) | (isDelta ? 0x01 : 0x00)
    buf.writeUInt8(sf, 7)
    buf.writeBigUInt64LE(BigInt(emitUs), 8)
    buf.writeBigUInt64LE(BigInt(prevSnapshotOffset), 16)
    buf.writeBigUInt64LE(BigInt(U), 24)
    buf.writeBigUInt64LE(BigInt(u), 32)
    buf.writeUInt16LE(bids.length, 40)
    buf.writeUInt16LE(asks.length, 42)
    buf.writeUInt32LE(0, 44)

    let off = RECORD_HEADER_SIZE
    for (const [p, q] of bids) {
        buf.writeBigInt64LE(p, off)
        buf.writeBigInt64LE(q, off + 8)
        off += LEVEL_SIZE
    }
    for (const [p, q] of asks) {
        buf.writeBigInt64LE(p, off)
        buf.writeBigInt64LE(q, off + 8)
        off += LEVEL_SIZE
    }
    return buf
}

export default {
    MAGIC,
    MAGIC_LENGTH,
    RECORD_HEADER_SIZE,
    LEVEL_SIZE,
    encodeScaled,
    decodeScaled,
    recordSize,
    writeRecord
}
