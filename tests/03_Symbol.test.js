import { expect } from 'chai'
import Asset from '../src/core/Asset.js'
import { getAsset } from '../src/core/assets.js'
import Symbol from '../src/core/Symbol.js'
import { resolveSymbol } from '../src/core/resolveSymbol.js'
import { binance } from '../src/exchanges/binance.js'

describe('Symbol', () => {
    it('should store base and quote as Assets', () => {
        const s = new Symbol(getAsset('btc'), getAsset('usdc'))
        expect(s.base).to.be.instanceOf(Asset)
        expect(s.quote).to.be.instanceOf(Asset)
        expect(s.base.id).to.equal('btc')
        expect(s.quote.id).to.equal('usdc')
    })

    it('should reject non-Asset arguments', () => {
        expect(() => new Symbol('btc', 'usdc')).to.throw()
    })

    it('should return pairId as base:quote', () => {
        const s = new Symbol(getAsset('eth'), getAsset('usdt'))
        expect(s.pairId).to.equal('eth:usdt')
    })

    it('should return id as :pairId when no exchange', () => {
        const s = new Symbol(getAsset('eth'), getAsset('usdt'))
        expect(s.id).to.equal(':eth:usdt')
    })

    it('should return id with exchange prefix when bound', () => {
        const sym = binance.getSymbol('btc:usdc')
        expect(sym.id).to.equal('binance:btc:usdc')
    })

    it('should have toString fall back to id', () => {
        const s = new Symbol(getAsset('sol'), getAsset('usdc'))
        expect(s.toString()).to.equal(':sol:usdc')
        const sym = binance.getSymbol('btc:usdc')
        expect(sym.toString()).to.equal('binance:btc:usdc')
    })

    it('should resolve exchange:base:quote string', () => {
        const sym = resolveSymbol('binance:eth:usdc')
        expect(sym.id).to.equal('binance:eth:usdc')
        expect(sym.exchange).to.equal(binance)
    })

    it('should throw on invalid resolve format', () => {
        expect(() => resolveSymbol('ethusdc')).to.throw('expected exchange:base:quote')
        expect(() => resolveSymbol('binance:eth')).to.throw('expected exchange:base:quote')
    })

    it('should throw on unknown exchange in resolve', () => {
        expect(() => resolveSymbol('fake:eth:usdc')).to.throw('Exchange not found')
    })
})
