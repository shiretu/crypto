import { expect } from 'chai'
import Trade from '../src/core/Trade.js'

const writeTrade = (buf, offset, tsUs, price, baseQty, quoteQty, isBuyerMaker) => {
    const flag = isBuyerMaker ? 1n : 0n
    buf.writeBigUInt64LE(BigInt(tsUs) | (flag << 63n), offset)
    buf.writeDoubleLE(price, offset + 8)
    buf.writeDoubleLE(baseQty, offset + 16)
    buf.writeDoubleLE(quoteQty, offset + 24)
}

describe('Trade', () => {
    it('should have RECORD_SIZE of 32', () => {
        expect(Trade.RECORD_SIZE).to.equal(32)
    })

    it('should read tsUs from buffer', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        writeTrade(buf, 0, 1704067200123456, 42000, 0.5, 21000, false)
        const trade = new Trade(buf)
        expect(trade.tsUs).to.equal(1704067200123456)
    })

    it('should read price from buffer', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        writeTrade(buf, 0, 1000000, 42123.45, 0.1, 4212, false)
        const trade = new Trade(buf)
        expect(trade.price).to.equal(42123.45)
    })

    it('should read baseQty from buffer', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        writeTrade(buf, 0, 1000000, 42000, 1.2345, 51869, false)
        const trade = new Trade(buf)
        expect(trade.baseQty).to.equal(1.2345)
    })

    it('should read quoteQty from buffer', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        writeTrade(buf, 0, 1000000, 42000, 0.5, 21000.75, false)
        const trade = new Trade(buf)
        expect(trade.quoteQty).to.equal(21000.75)
    })

    it('should read isBuyerMaker false', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        writeTrade(buf, 0, 1000000, 42000, 0.5, 21000, false)
        const trade = new Trade(buf)
        expect(trade.isBuyerMaker).to.equal(false)
    })

    it('should read isBuyerMaker true', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        writeTrade(buf, 0, 1000000, 42000, 0.5, 21000, true)
        const trade = new Trade(buf)
        expect(trade.isBuyerMaker).to.equal(true)
    })

    it('should preserve tsUs when isBuyerMaker is true', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        const ts = 1704067200999999
        writeTrade(buf, 0, ts, 42000, 0.5, 21000, true)
        const trade = new Trade(buf)
        expect(trade.tsUs).to.equal(ts)
        expect(trade.isBuyerMaker).to.equal(true)
    })

    it('should be a view on a subarray of a larger buffer', () => {
        const big = Buffer.alloc(Trade.RECORD_SIZE * 3)
        writeTrade(big, 0, 1000000, 100, 0.1, 10, false)
        writeTrade(big, Trade.RECORD_SIZE, 2000000, 200, 0.2, 40, true)
        writeTrade(big, Trade.RECORD_SIZE * 2, 3000000, 300, 0.3, 90, false)

        const t0 = new Trade(big.subarray(0, Trade.RECORD_SIZE))
        const t1 = new Trade(big.subarray(Trade.RECORD_SIZE, Trade.RECORD_SIZE * 2))
        const t2 = new Trade(big.subarray(Trade.RECORD_SIZE * 2, Trade.RECORD_SIZE * 3))

        expect(t0.tsUs).to.equal(1000000)
        expect(t0.price).to.equal(100)
        expect(t0.isBuyerMaker).to.equal(false)

        expect(t1.tsUs).to.equal(2000000)
        expect(t1.price).to.equal(200)
        expect(t1.isBuyerMaker).to.equal(true)

        expect(t2.tsUs).to.equal(3000000)
        expect(t2.price).to.equal(300)
        expect(t2.isBuyerMaker).to.equal(false)
    })

    it('should reflect mutations in the underlying buffer', () => {
        const buf = Buffer.alloc(Trade.RECORD_SIZE)
        writeTrade(buf, 0, 1000000, 42000, 0.5, 21000, false)
        const trade = new Trade(buf)
        expect(trade.price).to.equal(42000)

        buf.writeDoubleLE(43000, 8)
        expect(trade.price).to.equal(43000)
    })
})
