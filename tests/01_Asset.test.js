import { expect } from 'chai'
import Asset from '../src/core/Asset.js'
import { getAsset, hasAsset, allAssets } from '../src/core/assets.js'

describe('Asset', () => {
    it('should store id lowercase', () => {
        const a = new Asset('BTC')
        expect(a.id).to.equal('btc')
    })

    it('should have uppercase toString', () => {
        const a = new Asset('eth')
        expect(a.toString()).to.equal('ETH')
    })

    it('should look up a known asset', () => {
        const a = getAsset('btc')
        expect(a).to.be.instanceOf(Asset)
        expect(a.id).to.equal('btc')
    })

    it('should be case-insensitive', () => {
        expect(getAsset('BTC')).to.equal(getAsset('btc'))
    })

    it('should resolve aliases to the same object', () => {
        expect(getAsset('$c')).to.equal(getAsset('usdc'))
        expect(getAsset('$c').id).to.equal('usdc')
    })

    it('should check existence with hasAsset', () => {
        expect(hasAsset('btc')).to.equal(true)
        expect(hasAsset('nonexistent')).to.equal(false)
    })

    it('should list all assets', () => {
        const all = allAssets()
        expect(all).to.be.an('array')
        expect(all.length).to.be.greaterThan(0)
        expect(all.map(a => a.id)).to.include('btc')
    })

    it('should throw on unknown asset', () => {
        expect(() => getAsset('fakecoin')).to.throw()
    })
})
