import { expect } from 'chai'
import Asset from '../src/core/Asset.js'
import { getAsset } from '../src/core/assets.js'
import Symbol from '../src/core/Symbol.js'

describe('Symbol', () => {
    describe('constructor', () => {
        it('should accept Asset instances', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            expect(s.base).to.be.instanceOf(Asset)
            expect(s.quote).to.be.instanceOf(Asset)
        })

        it('should store base and quote correctly', () => {
            const s = new Symbol(getAsset('eth'), getAsset('usdt'))
            expect(s.base.id).to.equal('eth')
            expect(s.quote.id).to.equal('usdt')
        })

        it('should reject string for base', () => {
            expect(() => new Symbol('btc', getAsset('usdc'))).to.throw('base must be an Asset')
        })

        it('should reject string for quote', () => {
            expect(() => new Symbol(getAsset('btc'), 'usdc')).to.throw('quote must be an Asset')
        })

        it('should reject both strings', () => {
            expect(() => new Symbol('btc', 'usdc')).to.throw('base must be an Asset')
        })

        it('should start with no exchange', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            expect(s.exchange).to.be.null
        })
    })

    describe('pairId', () => {
        it('should return base:quote format', () => {
            const s = new Symbol(getAsset('eth'), getAsset('usdt'))
            expect(s.pairId).to.equal('eth:usdt')
        })
    })

    describe('id', () => {
        it('should return :pairId when no exchange', () => {
            const s = new Symbol(getAsset('eth'), getAsset('usdt'))
            expect(s.id).to.equal(':eth:usdt')
        })
    })

    describe('toString', () => {
        it('should return id', () => {
            const s = new Symbol(getAsset('sol'), getAsset('usdc'))
            expect(s.toString()).to.equal(':sol:usdc')
        })
    })

    describe('exchange binding', () => {
        it('should accept exchange assignment', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const fakeExchange = { id: 'test' }
            s.exchange = fakeExchange
            expect(s.exchange).to.equal(fakeExchange)
        })

        it('should include exchange in id after binding', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            s.exchange = { id: 'binance' }
            expect(s.id).to.equal('binance:btc:usdc')
        })

        it('should throw on double assignment', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            s.exchange = { id: 'binance' }
            expect(() => { s.exchange = { id: 'kraken' } }).to.throw('already belongs')
        })
    })
})
