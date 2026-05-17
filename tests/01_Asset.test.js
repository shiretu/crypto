import { expect } from 'chai'
import Asset from '../src/core/Asset.js'
import { getAsset, hasAsset, allAssets } from '../src/core/assets.js'

describe('Asset', () => {
    describe('constructor', () => {
        it('should store id as lowercase', () => {
            expect(new Asset('BTC').id).to.equal('btc')
        })

        it('should handle already-lowercase input', () => {
            expect(new Asset('eth').id).to.equal('eth')
        })

        it('should handle mixed case', () => {
            expect(new Asset('UsDc').id).to.equal('usdc')
        })
    })

    describe('toString', () => {
        it('should return uppercase', () => {
            expect(new Asset('eth').toString()).to.equal('ETH')
        })

        it('should return uppercase regardless of input case', () => {
            expect(new Asset('BTC').toString()).to.equal('BTC')
        })
    })

    describe('getAsset', () => {
        it('should return an Asset instance', () => {
            expect(getAsset('btc')).to.be.instanceOf(Asset)
        })

        it('should return the correct id', () => {
            expect(getAsset('btc').id).to.equal('btc')
        })

        it('should be case-insensitive', () => {
            expect(getAsset('BTC')).to.equal(getAsset('btc'))
        })

        it('should resolve aliases to the same object', () => {
            const byAlias = getAsset('$c')
            const byId = getAsset('usdc')
            expect(byAlias).to.equal(byId)
            expect(byAlias.id).to.equal('usdc')
        })

        it('should throw on unknown asset', () => {
            expect(() => getAsset('fakecoin')).to.throw('Unknown asset')
        })
    })

    describe('hasAsset', () => {
        it('should return true for known assets', () => {
            expect(hasAsset('btc')).to.equal(true)
            expect(hasAsset('eth')).to.equal(true)
        })

        it('should return false for unknown assets', () => {
            expect(hasAsset('nonexistent')).to.equal(false)
        })

        it('should be case-insensitive', () => {
            expect(hasAsset('BTC')).to.equal(true)
        })

        it('should find aliases', () => {
            expect(hasAsset('$c')).to.equal(true)
        })
    })

    describe('allAssets', () => {
        it('should return an array', () => {
            expect(allAssets()).to.be.an('array')
        })

        it('should contain known assets', () => {
            const ids = allAssets().map(a => a.id)
            expect(ids).to.include('btc')
            expect(ids).to.include('eth')
            expect(ids).to.include('usdc')
        })

        it('should not contain duplicate objects', () => {
            const all = allAssets()
            const unique = new Set(all)
            expect(unique.size).to.equal(all.length)
        })

        it('should be sorted alphabetically by id', () => {
            const ids = allAssets().map(a => a.id)
            const sorted = [...ids].sort()
            expect(ids).to.deep.equal(sorted)
        })

        it('should return Asset instances', () => {
            for (const a of allAssets()) {
                expect(a).to.be.instanceOf(Asset)
            }
        })
    })

    describe('identity', () => {
        it('should return the same object for repeated lookups', () => {
            const a1 = getAsset('eth')
            const a2 = getAsset('eth')
            expect(a1).to.equal(a2)
        })
    })
})
