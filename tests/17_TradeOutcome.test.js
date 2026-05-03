import { expect } from 'chai'
import { LongOrder, ShortOrder } from '../src/core/Order.js'
import TradeOutcome from '../src/core/TradeOutcome.js'

const t = (price, tsUs = 1000000, srcId = 0) => ({ price, tsUs, srcId })

describe('TradeOutcome', () => {
    it('should reject non-positive tpPercent', () => {
        expect(() => new TradeOutcome({ tpPercent: 0, slPercent: 1, trade: t(100) })).to.throw('tpPercent')
    })

    it('should reject non-positive slPercent', () => {
        expect(() => new TradeOutcome({ tpPercent: 1.5, slPercent: -1, trade: t(100) })).to.throw('slPercent')
    })

    it('should start uncompleted with null orders', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100) })
        expect(to.completed).to.equal(false)
        expect(to.longOrder).to.equal(null)
        expect(to.shortOrder).to.equal(null)
    })

    it('should resolve long TP on price rise', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        expect(to.update(t(100.5, 2000000, 32))).to.equal(false)
        expect(to.longOrder).to.equal(null)
        expect(to.update(t(101.5, 3000000, 64))).to.equal(true)
        const lo = to.longOrder
        expect(lo).to.be.instanceOf(LongOrder)
        expect(lo.close.price).to.equal(101.5)
        expect(lo.profitPercent).to.be.closeTo(1.5, 1e-10)
        expect(lo.durationUs).to.equal(2000000)
    })

    it('should resolve long SL on price drop', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        to.update(t(99, 2000000, 32))
        const lo = to.longOrder
        expect(lo).to.be.instanceOf(LongOrder)
        expect(lo.profitPercent).to.equal(-1)
    })

    it('should resolve short TP on price drop', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        to.update(t(98.5, 2000000, 32))
        const so = to.shortOrder
        expect(so).to.be.instanceOf(ShortOrder)
        expect(so.profitPercent).to.be.closeTo(1.5, 1e-10)
    })

    it('should resolve short SL on price rise', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        to.update(t(101, 2000000, 32))
        const so = to.shortOrder
        expect(so).to.be.instanceOf(ShortOrder)
        expect(so.profitPercent).to.equal(-1)
    })

    it('should resolve both on large price move up', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        expect(to.update(t(101.5, 2000000, 32))).to.equal(true)
        expect(to.longOrder.profitPercent).to.be.closeTo(1.5, 1e-10)
        expect(to.shortOrder.profitPercent).to.be.closeTo(-1.5, 1e-10)
    })

    it('should resolve both on large price move down', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        expect(to.update(t(98.5, 2000000, 32))).to.equal(true)
        expect(to.longOrder.profitPercent).to.be.closeTo(-1.5, 1e-10)
        expect(to.shortOrder.profitPercent).to.be.closeTo(1.5, 1e-10)
    })

    it('should resolve directions at different times', () => {
        const to = new TradeOutcome({ tpPercent: 2, slPercent: 1, trade: t(100, 1000000, 0) })
        to.update(t(101, 2000000, 32))
        expect(to.shortOrder).to.not.equal(null)
        expect(to.shortOrder.profitPercent).to.equal(-1)
        expect(to.longOrder).to.equal(null)
        expect(to.completed).to.equal(false)

        to.update(t(102, 3000000, 64))
        expect(to.longOrder).to.not.equal(null)
        expect(to.longOrder.profitPercent).to.equal(2)
        expect(to.completed).to.equal(true)
    })

    it('should not change resolved direction on subsequent trades', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        to.update(t(101.5, 2000000, 32))
        to.update(t(99, 3000000, 64))
        const lo = to.longOrder
        expect(lo.close.tsUs).to.equal(2000000)
        expect(lo.profitPercent).to.be.closeTo(1.5, 1e-10)
    })

    it('should not resolve on price within range', () => {
        const to = new TradeOutcome({ tpPercent: 1.5, slPercent: 1, trade: t(100, 1000000, 0) })
        to.update(t(100.5, 2000000, 32))
        to.update(t(99.5, 3000000, 64))
        to.update(t(100.2, 4000000, 96))
        expect(to.completed).to.equal(false)
        expect(to.longOrder).to.equal(null)
        expect(to.shortOrder).to.equal(null)
    })
})
