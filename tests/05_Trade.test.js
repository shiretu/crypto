import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import { binance } from '../src/exchanges/binance.js'

describe('Trade', () => {
    const sym = binance.getSymbol('btc:usdc')

    it('should round-trip through binary serialization', () => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000.50, 0.001, 42.0005, true)

        const trade = Trade.fromBuffer(sym, 0, buf, 0)
        expect(trade.tsUs).to.equal(1704067200000000)
        expect(trade.price).to.be.closeTo(42000.50, 0.0001)
        expect(trade.baseQty).to.be.closeTo(0.001, 0.000001)
        expect(trade.quoteQty).to.be.closeTo(42.0005, 0.0001)
        expect(trade.isBuyerMaker).to.equal(true)
        expect(trade.symbol).to.equal(sym)
    })

    it('should reject missing symbol', () => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000, 0.01, 420, false)
        expect(() => Trade.fromBuffer(undefined, 0, buf, 0)).to.throw()
    })

    it('should attach symbol with correct assets', () => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000, 0.01, 420, false)

        const trade = Trade.fromBuffer(sym, 0, buf, 0)
        expect(trade.symbol).to.equal(sym)
        expect(trade.symbol.base.id).to.equal('btc')
    })

    it('should preserve isBuyerMaker=false', () => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 100, 1, 100, false)

        const trade = Trade.fromBuffer(sym, 0, buf, 0)
        expect(trade.isBuyerMaker).to.equal(false)
    })

    it('should compute tsMs and date from tsUs', () => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        const tsUs = 1704067200123456
        Trade.toBuffer(buf, 0, tsUs, 100, 1, 100, false)

        const trade = Trade.fromBuffer(sym, 0, buf, 0)
        expect(trade.tsMs).to.equal(1704067200123)
        expect(trade.date).to.be.an.instanceOf(Date)
    })

    it('should handle multiple records in a buffer', () => {
        const count = 5
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * count)
        for (let i = 0; i < count; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + i * 1000, 100 + i, 0.1 * (i + 1), 10 * (i + 1), i % 2 === 0)
        }

        for (let i = 0; i < count; i++) {
            const trade = Trade.fromBuffer(sym, i * Trade.RECORD_SIZE, buf, i * Trade.RECORD_SIZE)
            expect(trade.tsUs).to.equal(1704067200000000 + i * 1000)
            expect(trade.isBuyerMaker).to.equal(i % 2 === 0)
        }
    })

    it('should set srcId from buffer offset', () => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 100, 1, 100, false)
        const trade = Trade.fromBuffer(sym, 0, buf, 0)
        expect(trade.srcId).to.equal(0)
    })

    it('should accept srcId override in fromBuffer', () => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 100, 1, 100, false)
        const trade = Trade.fromBuffer(sym, 64, buf, 0)
        expect(trade.srcId).to.equal(64)
    })

    it('should reject negative srcId in constructor', () => {
        expect(() => new Trade(sym, -1, 1704067200000000, 100, 1, 100, false)).to.throw()
    })
})
