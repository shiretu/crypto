import { expect } from 'chai'
import { resolveSymbol } from '../src/core/resolveSymbol.js'
import Symbol from '../src/core/Symbol.js'

describe('resolveSymbol', () => {
    describe('parsing', () => {
        it('should parse exchange:base:quote', () => {
            const sym = resolveSymbol('binance:eth:usdc')
            expect(sym).to.be.instanceOf(Symbol)
            expect(sym.base.id).to.equal('eth')
            expect(sym.quote.id).to.equal('usdc')
            expect(sym.exchange.id).to.equal('binance')
        })

        it('should produce a Symbol with id matching the input (normalized)', () => {
            const sym = resolveSymbol('binance:eth:usdc')
            expect(sym.id).to.equal('binance:eth:usdc')
        })

        it('should be case-insensitive', () => {
            const sym = resolveSymbol('Binance:BTC:USDC')
            expect(sym.exchange.id).to.equal('binance')
            expect(sym.base.id).to.equal('btc')
            expect(sym.quote.id).to.equal('usdc')
        })

        it('should be case-insensitive on all-uppercase', () => {
            const sym = resolveSymbol('BINANCE:ETH:USDT')
            expect(sym.id).to.equal('binance:eth:usdt')
        })
    })

    describe('identity', () => {
        it('should return the same Symbol instance for repeated calls', () => {
            const a = resolveSymbol('binance:eth:usdc')
            const b = resolveSymbol('binance:eth:usdc')
            expect(a).to.equal(b)
        })

        it('should return the same instance regardless of input casing', () => {
            const a = resolveSymbol('binance:eth:usdc')
            const b = resolveSymbol('BINANCE:ETH:USDC')
            expect(a).to.equal(b)
        })
    })

    describe('invalid format', () => {
        it('should throw on no separator', () => {
            expect(() => resolveSymbol('ethusdc')).to.throw('expected exchange:base:quote')
        })

        it('should throw on too few parts', () => {
            expect(() => resolveSymbol('binance:eth')).to.throw('expected exchange:base:quote')
        })

        it('should throw on too many parts', () => {
            expect(() => resolveSymbol('binance:eth:usdc:extra')).to.throw('expected exchange:base:quote')
        })

        it('should throw on empty exchange part', () => {
            expect(() => resolveSymbol(':eth:usdc')).to.throw('expected exchange:base:quote')
        })

        it('should throw on empty base part', () => {
            expect(() => resolveSymbol('binance::usdc')).to.throw('expected exchange:base:quote')
        })

        it('should throw on empty quote part', () => {
            expect(() => resolveSymbol('binance:eth:')).to.throw('expected exchange:base:quote')
        })

        it('should throw on empty string', () => {
            expect(() => resolveSymbol('')).to.throw('expected exchange:base:quote')
        })
    })

    describe('unknown exchange/symbol', () => {
        it('should throw on unknown exchange', () => {
            expect(() => resolveSymbol('fakeexchange:eth:usdc')).to.throw('Exchange not found')
        })

        it('should throw on unknown symbol for a known exchange', () => {
            // doge:usdc is not in the binance pairs list
            expect(() => resolveSymbol('binance:doge:usdc')).to.throw('not found')
        })
    })
})
