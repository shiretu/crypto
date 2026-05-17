import { Buffer } from 'buffer'

/**
 * Binary on-disk format for order-book records (snapshots and deltas).
 *
 * Record layout (8-byte aligned):
 *   offset 0..6     magic07 (7 bytes)
 *   offset 7        scaleAndFlags: high nibble = scaleExp (0..15),
 *                                  bit 0      = isDiff (1) vs snapshot (0)
 *   offset 8..15    eventTime in microseconds       (u64 LE)
 *   offset 16..23   prevSnapshotOffset              (u64 LE) — sentinel when unused
 *   offset 24..31   firstUpdateId                   (u64 LE)
 *   offset 32..39   lastUpdateId                    (u64 LE)
 *   offset 40..41   bidCount                        (u16 LE)
 *   offset 42..43   askCount                        (u16 LE)
 *   offset 44..47   reserved                        (u32 LE, zero)
 *   offset 48..     levels: (i64 price, i64 qty) × (bidCount + askCount)
 */
export default class OrderBookFormat {
    // 7-byte ASCII magic at the start of every record. Lets us scan, recover,
    // and binary-search a torn file without an external index.
    static #MAGIC = Buffer.from('magic07', 'ascii')
    static #MAGIC_LENGTH = 7
    static #RECORD_HEADER_SIZE = 48
    static #LEVEL_SIZE = 16 // i64 price + i64 qty
    static #PREV_SNAPSHOT_OFFSET_SENTINEL = 0xffffffffffffffffn

    static #recordSize (bidCount, askCount) {
        return OrderBookFormat.#RECORD_HEADER_SIZE + OrderBookFormat.#LEVEL_SIZE * (bidCount + askCount)
    }

    /**
     * Parse a wire price/qty string into a scaled BigInt.
     * scaleExp ∈ [0, 15]. Throws if the string has more decimals than scaleExp.
     */
    static #encodeScaled (wireStr, scaleExp) {
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
    static #decodeScaled (n, scaleExp) {
        const SCALE = 10n ** BigInt(scaleExp)
        const neg = n < 0n
        const abs = neg ? -n : n
        const intPart = abs / SCALE
        const fracDigits = (abs % SCALE).toString().padStart(scaleExp, '0').replace(/0+$/, '')
        return (neg ? '-' : '') + intPart + (fracDigits ? '.' + fracDigits : '')
    }

    /**
     * Encode a single order-book record (snapshot or delta) into the spec
     * binary layout. Takes the raw upstream record (price/qty as wire strings,
     * eventTime in milliseconds) plus `scaleExp`, and produces the final buffer.
     *
     * @param {Object}  rec
     * @param {boolean} rec.isDiff               - false = snapshot, true = delta
     * @param {number}  rec.scaleExp             - 0..15, encoded in byte 7 high nibble
     * @param {number|bigint} rec.eventTime      - upstream event time, milliseconds
     * @param {number|bigint} rec.firstUpdateId  - first updateId in batch (Binance `U`)
     * @param {number|bigint} rec.lastUpdateId   - last  updateId in batch (Binance `u`)
     * @param {Array<[string,string]>} rec.bids  - [priceStr, qtyStr] pairs
     * @param {Array<[string,string]>} rec.asks
     * @param {Buffer} [destBuf]                 - optional reusable buffer
     * @returns {{ buf: Buffer, size: number }}
     */
    static encode ({ isDiff, scaleExp, eventTime, firstUpdateId, lastUpdateId, bids, asks }, destBuf) {
        if (scaleExp < 0 || scaleExp > 15) throw new Error(`scaleExp out of range: ${scaleExp}`)
        if (bids.length > 0xffff || asks.length > 0xffff) {
            throw new Error(`level count overflow: bids=${bids.length} asks=${asks.length}`)
        }
        const size = OrderBookFormat.#recordSize(bids.length, asks.length)
        if (size % 8 !== 0) throw new Error(`record size ${size} not 8-aligned`)

        if ((destBuf == null) || (destBuf.length < size)) {
            destBuf = Buffer.allocUnsafe(size)
        }
        OrderBookFormat.#MAGIC.copy(destBuf, 0)
        const sf = (scaleExp << 4) | (isDiff ? 0x01 : 0x00)
        destBuf.writeUInt8(sf, 7)
        destBuf.writeBigUInt64LE(BigInt(eventTime) * 1000n, 8)
        destBuf.writeBigUInt64LE(OrderBookFormat.#PREV_SNAPSHOT_OFFSET_SENTINEL, 16)
        destBuf.writeBigUInt64LE(BigInt(firstUpdateId), 24)
        destBuf.writeBigUInt64LE(BigInt(lastUpdateId), 32)
        destBuf.writeUInt16LE(bids.length, 40)
        destBuf.writeUInt16LE(asks.length, 42)
        destBuf.writeUInt32LE(0, 44)

        let off = OrderBookFormat.#RECORD_HEADER_SIZE
        for (const [priceStr, qtyStr] of bids) {
            destBuf.writeBigInt64LE(OrderBookFormat.#encodeScaled(priceStr, scaleExp), off)
            destBuf.writeBigInt64LE(OrderBookFormat.#encodeScaled(qtyStr, scaleExp), off + 8)
            off += OrderBookFormat.#LEVEL_SIZE
        }
        for (const [priceStr, qtyStr] of asks) {
            destBuf.writeBigInt64LE(OrderBookFormat.#encodeScaled(priceStr, scaleExp), off)
            destBuf.writeBigInt64LE(OrderBookFormat.#encodeScaled(qtyStr, scaleExp), off + 8)
            off += OrderBookFormat.#LEVEL_SIZE
        }
        return { buf: destBuf, size }
    }

    /**
     * Decode a single record from `buf` starting at `offset`. Levels are
     * returned as [priceStr, qtyStr] string pairs. `eventTimeUs` and the
     * three id fields are returned as BigInts (raw stored values).
     *
     * @param {Buffer} buf
     * @param {number} [offset=0]
     * @returns {{ rec: Object, size: number }}
     */
    static decode (buf, offset = 0) {
        if (buf.length - offset < OrderBookFormat.#RECORD_HEADER_SIZE) {
            throw new Error(`buffer too small for header at offset ${offset}: have ${buf.length - offset} need ${OrderBookFormat.#RECORD_HEADER_SIZE}`)
        }
        if (buf.compare(OrderBookFormat.#MAGIC, 0, OrderBookFormat.#MAGIC_LENGTH, offset, offset + OrderBookFormat.#MAGIC_LENGTH) !== 0) {
            throw new Error(`bad magic at offset ${offset}`)
        }
        const sf = buf.readUInt8(offset + 7)
        const scaleExp = (sf >> 4) & 0x0f
        const isDiff = (sf & 0x01) === 0x01
        const eventTimeUs = buf.readBigUInt64LE(offset + 8)
        const prevSnapshotOffset = buf.readBigUInt64LE(offset + 16)
        const firstUpdateId = buf.readBigUInt64LE(offset + 24)
        const lastUpdateId = buf.readBigUInt64LE(offset + 32)
        const bidCount = buf.readUInt16LE(offset + 40)
        const askCount = buf.readUInt16LE(offset + 42)

        const size = OrderBookFormat.#recordSize(bidCount, askCount)
        if (buf.length - offset < size) {
            throw new Error(`buffer too small for body at offset ${offset}: have ${buf.length - offset} need ${size}`)
        }

        const bids = new Array(bidCount)
        let off = offset + OrderBookFormat.#RECORD_HEADER_SIZE
        for (let i = 0; i < bidCount; i++) {
            const p = buf.readBigInt64LE(off)
            const q = buf.readBigInt64LE(off + 8)
            bids[i] = [OrderBookFormat.#decodeScaled(p, scaleExp), OrderBookFormat.#decodeScaled(q, scaleExp)]
            off += OrderBookFormat.#LEVEL_SIZE
        }
        const asks = new Array(askCount)
        for (let i = 0; i < askCount; i++) {
            const p = buf.readBigInt64LE(off)
            const q = buf.readBigInt64LE(off + 8)
            asks[i] = [OrderBookFormat.#decodeScaled(p, scaleExp), OrderBookFormat.#decodeScaled(q, scaleExp)]
            off += OrderBookFormat.#LEVEL_SIZE
        }

        return {
            rec: {
                isDiff,
                scaleExp,
                eventTimeUs,
                prevSnapshotOffset,
                firstUpdateId,
                lastUpdateId,
                bids,
                asks
            },
            size
        }
    }
}
