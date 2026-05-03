import { expect } from 'chai'
import Asset from '../src/core/Asset.js'
import { getAsset } from '../src/core/assets.js'
import Symbol from '../src/core/Symbol.js'
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

    it('should have a readable toString', () => {
        const s = new Symbol(getAsset('sol'), getAsset('usdc'))
        expect(s.toString()).to.equal('SOL/USDC')
    })

    it('should parse common symbol strings', () => {
        expect(Symbol.parse('BTCUSDC').pairId).to.equal('btc:usdc')
        expect(Symbol.parse('ethusdt').pairId).to.equal('eth:usdt')
        expect(Symbol.parse('SOL/USDC').pairId).to.equal('sol:usdc')
        expect(Symbol.parse('BTC-USDT').pairId).to.equal('btc:usdt')
    })

    it('should throw on unparseable symbol', () => {
        expect(() => Symbol.parse('X')).to.throw()
    })
})
