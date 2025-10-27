/* eslint-env mocha */
const assert = require('assert')
const Symbol = require('../src/core/Symbol')

describe('Symbol', function () {
    it('should throw if constructed with non-existent assets', function () {
        assert.throws(() => new Symbol('FAKE', 'USDC'), /Invalid asset name: base: FAKE/)
        assert.throws(() => new Symbol('BTC', 'FAKE'), /Invalid asset name: quote: FAKE/)
        assert.throws(() => new Symbol('FAKE', 'FAKE'), /Invalid asset name: base: FAKE/)
    })

    it('should create a symbol with correct base and quote', function () {
        const s = new Symbol('BTC', 'USDC')
        assert.strictEqual(s.baseAssetName, 'btc')
        assert.strictEqual(s.quoteAssetName, 'usdc')
        assert.strictEqual(s.id, 'btcusdc')
    })

    it('should create a symbol with correct base and quote, case insensitive', function () {
        const s = new Symbol('BTc', 'usdC')
        assert.strictEqual(s.baseAssetName, 'btc')
        assert.strictEqual(s.quoteAssetName, 'usdc')
        assert.strictEqual(s.id, 'btcusdc')
    })

    it('should format name with separator and case', function () {
        const s = new Symbol('btc', 'usdc')
        assert.strictEqual(s.name('-', true), 'BTC-USDC')
        assert.strictEqual(s.name('-', false), 'btc-usdc')
    })

    it('should find symbol by all case variations of valid aliases', function () {
        // All case variations of these aliases should work
        const baseAliases = ['BTCUSDC', 'btc-usdc', 'BtcUsdc', 'BtC-uSdC']
        for (const alias of baseAliases) {
            // Try all case variations
            const variations = [
                alias,
                alias.toLowerCase(),
                alias.toUpperCase(),
                alias[0].toUpperCase() + alias.slice(1).toLowerCase()
            ]
            for (const v of variations) {
                const s = Symbol.find(v)
                assert.strictEqual(s.id, 'btcusdc', `Alias ${v} should resolve to btcusdc`)
            }
        }
    })

    it('should throw if alias not found or separator is wrong', function () {
        // Only - and no separator are valid, _ is not
        const invalidAliases = ['btc_usdc', 'BTC_USDC', 'notreal']
        for (const alias of invalidAliases) {
            assert.throws(() => Symbol.find(alias), /not found/, `Alias ${alias} should not resolve`)
        }
    })
})
