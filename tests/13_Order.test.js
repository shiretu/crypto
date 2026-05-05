import { expect } from 'chai'
import { LongOrder, ShortOrder } from '../src/core/Order.js'

const t = (price, tsUs = 1000000, srcId = 0) => ({ price, tsUs, srcId })

describe('Order', () => {
    it('LongOrder should compute positive profitPercent on price rise', () => {
        const order = new LongOrder(t(100, 1000000, 0), t(105, 2000000, 32))
        expect(order.open.price).to.equal(100)
        expect(order.close.price).to.equal(105)
        expect(order.profitPercent).to.equal(5)
        expect(order.durationUs).to.equal(1000000)
    })

    it('LongOrder should compute negative profitPercent on price drop', () => {
        const order = new LongOrder(t(100, 1000000, 0), t(98, 3000000, 64))
        expect(order.profitPercent).to.equal(-2)
        expect(order.durationUs).to.equal(2000000)
    })

    it('ShortOrder should compute positive profitPercent on price drop', () => {
        const order = new ShortOrder(t(100, 1000000, 0), t(97, 2000000, 32))
        expect(order.profitPercent).to.equal(3)
        expect(order.durationUs).to.equal(1000000)
    })

    it('ShortOrder should compute negative profitPercent on price rise', () => {
        const order = new ShortOrder(t(100, 1000000, 0), t(104, 3000000, 64))
        expect(order.profitPercent).to.equal(-4)
        expect(order.durationUs).to.equal(2000000)
    })
})
