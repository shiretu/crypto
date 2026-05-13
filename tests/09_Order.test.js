import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import { Order, LongOrder, ShortOrder } from '../src/core/Order.js'

const makeTrade = (tsUs, price) => {
    const buf = Buffer.alloc(Trade.RECORD_SIZE)
    Trade.writeRecord(buf, 0, tsUs, price, 1, price, false)
    return new Trade(buf)
}

describe('Order', () => {
    describe('Order base class', () => {
        it('should store open and close', () => {
            const open = makeTrade(1000, 100)
            const close = makeTrade(5000, 110)
            const o = new Order(open, close)
            expect(o.open).to.equal(open)
            expect(o.close).to.equal(close)
        })

        it('should compute durationUs as close - open', () => {
            const open = makeTrade(1000, 100)
            const close = makeTrade(5000, 110)
            const o = new Order(open, close)
            expect(o.durationUs).to.equal(4000)
        })

        it('should compute negative durationUs when close is earlier', () => {
            const open = makeTrade(5000, 100)
            const close = makeTrade(1000, 110)
            const o = new Order(open, close)
            expect(o.durationUs).to.equal(-4000)
        })

        it('should compute zero durationUs when same tsUs', () => {
            const open = makeTrade(1000, 100)
            const close = makeTrade(1000, 110)
            const o = new Order(open, close)
            expect(o.durationUs).to.equal(0)
        })
    })

    describe('LongOrder profitPercent', () => {
        it('should be positive when close > open', () => {
            const o = new LongOrder(makeTrade(1000, 100), makeTrade(2000, 110))
            expect(o.profitPercent).to.equal(10)
        })

        it('should be negative when close < open', () => {
            const o = new LongOrder(makeTrade(1000, 100), makeTrade(2000, 90))
            expect(o.profitPercent).to.equal(-10)
        })

        it('should be zero when close === open', () => {
            const o = new LongOrder(makeTrade(1000, 100), makeTrade(2000, 100))
            expect(o.profitPercent).to.equal(0)
        })

        it('should compute correct percent for 1.5% gain', () => {
            const o = new LongOrder(makeTrade(1000, 100), makeTrade(2000, 101.5))
            expect(o.profitPercent).to.be.closeTo(1.5, 1e-9)
        })

        it('should be expressed relative to open price', () => {
            // open=200, close=210 → +5%
            const o = new LongOrder(makeTrade(1000, 200), makeTrade(2000, 210))
            expect(o.profitPercent).to.be.closeTo(5, 1e-9)
        })
    })

    describe('ShortOrder profitPercent', () => {
        it('should be positive when close < open', () => {
            const o = new ShortOrder(makeTrade(1000, 100), makeTrade(2000, 90))
            expect(o.profitPercent).to.equal(10)
        })

        it('should be negative when close > open', () => {
            const o = new ShortOrder(makeTrade(1000, 100), makeTrade(2000, 110))
            expect(o.profitPercent).to.equal(-10)
        })

        it('should be zero when close === open', () => {
            const o = new ShortOrder(makeTrade(1000, 100), makeTrade(2000, 100))
            expect(o.profitPercent).to.equal(0)
        })

        it('should compute correct percent for 1% gain (price dropped)', () => {
            const o = new ShortOrder(makeTrade(1000, 100), makeTrade(2000, 99))
            expect(o.profitPercent).to.be.closeTo(1, 1e-9)
        })
    })

    describe('Long vs Short symmetry', () => {
        it('should have opposite signs for same trades', () => {
            const open = makeTrade(1000, 100)
            const close = makeTrade(2000, 110)
            const long = new LongOrder(open, close)
            const short = new ShortOrder(open, close)
            expect(long.profitPercent).to.equal(-short.profitPercent)
        })

        it('should both inherit Order properties', () => {
            const open = makeTrade(1000, 100)
            const close = makeTrade(5000, 110)
            expect(new LongOrder(open, close)).to.be.instanceOf(Order)
            expect(new ShortOrder(open, close)).to.be.instanceOf(Order)
        })
    })
})
