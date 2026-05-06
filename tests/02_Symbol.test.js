import { expect } from 'chai'
import Asset from '../src/core/Asset.js'
import { getAsset } from '../src/core/assets.js'
import Symbol from '../src/core/Symbol.js'

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

    it('should have toString fall back to id', () => {
        const s = new Symbol(getAsset('sol'), getAsset('usdc'))
        expect(s.toString()).to.equal(':sol:usdc')
    })
})
