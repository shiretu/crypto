import { expect } from 'chai'
import Trade from '../src/core/Trade.js'

const writeTrade = (buf, offset, tsUs, price, baseQty, quoteQty, isBuyerMaker) => {
    Trade.writeRecord(buf, offset, tsUs, price, baseQty, quoteQty, isBuyerMaker)
}

describe('Trade', () => {
    describe('static layout', () => {
        it('should have RECORD_SIZE of 32', () => {
            expect(Trade.RECORD_SIZE).to.equal(32)
        })
    })

    describe('constructor parameters', () => {
        it('should store dayIndex', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            const t = new Trade(buf, 42, 100)
            expect(t.dayIndex).to.equal(42)
        })

        it('should store absoluteIndex', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            const t = new Trade(buf, 42, 100)
            expect(t.absoluteIndex).to.equal(100)
        })

        it('should allow undefined dayIndex/absoluteIndex', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            const t = new Trade(buf)
            expect(t.dayIndex).to.be.undefined
            expect(t.absoluteIndex).to.be.undefined
        })
    })

    describe('reading from buffer', () => {
        it('should read tsUs', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            writeTrade(buf, 0, 1704067200123456, 42000, 0.5, 21000, false)
            expect(new Trade(buf).tsUs).to.equal(1704067200123456)
        })

        it('should read price', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            writeTrade(buf, 0, 1000000, 42123.45, 0.1, 4212, false)
            expect(new Trade(buf).price).to.equal(42123.45)
        })

        it('should read baseQty', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            writeTrade(buf, 0, 1000000, 42000, 1.2345, 51869, false)
            expect(new Trade(buf).baseQty).to.equal(1.2345)
        })

        it('should read quoteQty', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            writeTrade(buf, 0, 1000000, 42000, 0.5, 21000.75, false)
            expect(new Trade(buf).quoteQty).to.equal(21000.75)
        })

        it('should read isBuyerMaker false', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            writeTrade(buf, 0, 1000000, 42000, 0.5, 21000, false)
            expect(new Trade(buf).isBuyerMaker).to.equal(false)
        })

        it('should read isBuyerMaker true', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            writeTrade(buf, 0, 1000000, 42000, 0.5, 21000, true)
            expect(new Trade(buf).isBuyerMaker).to.equal(true)
        })
    })

    describe('isBuyerMaker flag bit packing', () => {
        it('should preserve tsUs when isBuyerMaker is true', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            const ts = 1704067200999999
            writeTrade(buf, 0, ts, 42000, 0.5, 21000, true)
            const trade = new Trade(buf)
            expect(trade.tsUs).to.equal(ts)
            expect(trade.isBuyerMaker).to.equal(true)
        })

        it('should preserve tsUs when isBuyerMaker is false', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            const ts = 1704067200999999
            writeTrade(buf, 0, ts, 42000, 0.5, 21000, false)
            const trade = new Trade(buf)
            expect(trade.tsUs).to.equal(ts)
            expect(trade.isBuyerMaker).to.equal(false)
        })

        it('should mask off bit 63 from tsUs', () => {
            // Write with flag, ensure tsUs mask works
            const buf = Buffer.alloc(Trade.RECORD_SIZE)
            writeTrade(buf, 0, 0, 1, 1, 1, true)
            expect(new Trade(buf).tsUs).to.equal(0)
            expect(new Trade(buf).isBuyerMaker).to.equal(true)
        })
    })

    describe('buffer views', () => {
        it('should work as a view on a subarray of a larger buffer', () => {
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

    describe('writeRecord with offset', () => {
        it('should write at a non-zero offset', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE * 2)
            writeTrade(buf, Trade.RECORD_SIZE, 5000000, 50, 5, 250, true)
            const t = new Trade(buf.subarray(Trade.RECORD_SIZE, Trade.RECORD_SIZE * 2))
            expect(t.tsUs).to.equal(5000000)
            expect(t.price).to.equal(50)
            expect(t.baseQty).to.equal(5)
            expect(t.quoteQty).to.equal(250)
            expect(t.isBuyerMaker).to.equal(true)
        })

        it('should not corrupt adjacent records', () => {
            const buf = Buffer.alloc(Trade.RECORD_SIZE * 2)
            writeTrade(buf, 0, 1000000, 100, 1, 100, false)
            writeTrade(buf, Trade.RECORD_SIZE, 2000000, 200, 2, 400, true)
            const t0 = new Trade(buf.subarray(0, Trade.RECORD_SIZE))
            expect(t0.tsUs).to.equal(1000000)
            expect(t0.price).to.equal(100)
            expect(t0.isBuyerMaker).to.equal(false)
        })
    })
})
