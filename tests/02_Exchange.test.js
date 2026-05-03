import { expect } from 'chai'
import Exchange from '../src/core/Exchange.js'
import { binance } from '../src/exchanges/binance.js'
import { getExchange, allExchanges } from '../src/exchanges/index.js'

describe('Exchange', () => {
    it('should store id lowercase', () => {
        const ex = new Exchange('Binance')
        expect(ex.id).to.equal('binance')
    })

    it('should return id lowercase for any case input', () => {
        const ex = new Exchange('KRAKEN')
        expect(ex.id).to.equal('kraken')
    })

    it('should have a readable toString', () => {
        const ex = new Exchange('coinbase')
        expect(ex.toString()).to.equal('coinbase')
    })

    it('should list supported symbols', () => {
        const symbols = binance.symbols
        expect(symbols).to.be.an('array')
        expect(symbols.length).to.be.greaterThan(0)
        expect(symbols.map(s => s.pairId)).to.include('btc:usdc')
    })

    it('should find a symbol by id', () => {
        const sym = binance.getSymbol('btc:usdc')
        expect(sym.base.id).to.equal('btc')
        expect(sym.quote.id).to.equal('usdc')
    })

    it('should check if a symbol is supported', () => {
        const sym = binance.getSymbol('btc:usdc')
        expect(binance.hasSymbol(sym)).to.equal(true)
    })

    it('should throw on unknown symbol', () => {
        expect(() => binance.getSymbol('foobar')).to.throw()
    })

    it('should load exchange by string', () => {
        const ex = getExchange('binance')
        expect(ex).to.equal(binance)
    })

    it('should throw on unknown exchange name', () => {
        expect(() => getExchange('nope')).to.throw()
    })

    it('should list all registered exchanges', () => {
        const all = allExchanges()
        expect(all).to.be.an('array')
        expect(all.map(e => e.id)).to.include('binance')
    })

    it('should return unique sorted assets', () => {
        const assets = binance.assets
        expect(assets).to.be.an('array')
        expect(assets.length).to.be.greaterThan(0)
        const ids = assets.map(a => a.id)
        expect(ids).to.include('btc')
        expect(ids).to.include('usdc')
        // no duplicates
        expect(new Set(ids).size).to.equal(ids.length)
        // sorted
        const sorted = [...ids].sort()
        expect(ids).to.deep.equal(sorted)
    })
})
