import { expect } from 'chai'
import { resolveSymbol } from '../src/core/resolveSymbol.js'

describe('resolveSymbol', () => {
    it('should parse exchange:base:quote', () => {
        const sym = resolveSymbol('binance:eth:usdc')
        expect(sym.base.id).to.equal('eth')
        expect(sym.quote.id).to.equal('usdc')
        expect(sym.exchange.id).to.equal('binance')
        expect(sym.id).to.equal('binance:eth:usdc')
    })

    it('should be case-insensitive', () => {
        const sym = resolveSymbol('Binance:BTC:USDC')
        expect(sym.exchange.id).to.equal('binance')
        expect(sym.base.id).to.equal('btc')
        expect(sym.quote.id).to.equal('usdc')
    })

    it('should throw on missing parts', () => {
        expect(() => resolveSymbol('ethusdc')).to.throw('expected exchange:base:quote')
        expect(() => resolveSymbol('binance:eth')).to.throw('expected exchange:base:quote')
    })

    it('should throw on empty parts', () => {
        expect(() => resolveSymbol(':eth:usdc')).to.throw('expected exchange:base:quote')
        expect(() => resolveSymbol('binance::usdc')).to.throw('expected exchange:base:quote')
        expect(() => resolveSymbol('binance:eth:')).to.throw('expected exchange:base:quote')
    })

    it('should throw on unknown exchange', () => {
        expect(() => resolveSymbol('fakexchange:eth:usdc')).to.throw('Exchange not found')
    })

    it('should throw on unknown symbol for exchange', () => {
        expect(() => resolveSymbol('binance:doge:usdc')).to.throw()
    })
})
