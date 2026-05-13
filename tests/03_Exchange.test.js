import { expect } from 'chai'
import Exchange from '../src/core/Exchange.js'
import Symbol from '../src/core/Symbol.js'
import Asset from '../src/core/Asset.js'
import { getAsset } from '../src/core/assets.js'

describe('Exchange', () => {
    describe('constructor', () => {
        it('should store id lowercase from mixed case input', () => {
            expect(new Exchange('Binance').id).to.equal('binance')
        })

        it('should store id lowercase from all-uppercase input', () => {
            expect(new Exchange('KRAKEN').id).to.equal('kraken')
        })

        it('should keep already-lowercase id', () => {
            expect(new Exchange('coinbase').id).to.equal('coinbase')
        })

        it('should default symbols to empty array', () => {
            const ex = new Exchange('test')
            expect(ex.symbols).to.be.an('array').with.length(0)
        })

        it('should accept and register symbols', () => {
            const s1 = new Symbol(getAsset('btc'), getAsset('usdc'))
            const s2 = new Symbol(getAsset('eth'), getAsset('usdc'))
            const ex = new Exchange('test', [s1, s2])
            expect(ex.symbols).to.have.length(2)
        })

        it('should bind exchange to each symbol on construction', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('binance', [s])
            expect(s.exchange).to.equal(ex)
        })

        it('should default downloader to null', () => {
            expect(new Exchange('test').downloader).to.be.null
        })

        it('should accept a downloader', () => {
            const dl = { downloadDay: () => {} }
            const ex = new Exchange('test', [], dl)
            expect(ex.downloader).to.equal(dl)
        })
    })

    describe('toString', () => {
        it('should return id', () => {
            expect(new Exchange('coinbase').toString()).to.equal('coinbase')
        })
    })

    describe('symbols', () => {
        it('should return a new array (not internal reference)', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            const a = ex.symbols
            const b = ex.symbols
            expect(a).to.not.equal(b)
            expect(a).to.deep.equal(b)
        })

        it('should return Symbol instances', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            expect(ex.symbols[0]).to.be.instanceOf(Symbol)
        })
    })

    describe('hasSymbol', () => {
        it('should return true for a registered symbol', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            expect(ex.hasSymbol(s)).to.equal(true)
        })

        it('should return true for a different Symbol instance with same pairId', () => {
            const s1 = new Symbol(getAsset('btc'), getAsset('usdc'))
            const s2 = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s1])
            expect(ex.hasSymbol(s2)).to.equal(true)
        })

        it('should return false for an unregistered symbol', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            const other = new Symbol(getAsset('eth'), getAsset('usdt'))
            expect(ex.hasSymbol(other)).to.equal(false)
        })
    })

    describe('getSymbol', () => {
        it('should return the symbol for a known pairId', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            expect(ex.getSymbol('btc:usdc')).to.equal(s)
        })

        it('should be case-insensitive', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            expect(ex.getSymbol('BTC:USDC')).to.equal(s)
        })

        it('should throw for an unknown pairId', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            expect(() => ex.getSymbol('doge:usdc')).to.throw('not found')
        })
    })

    describe('assets', () => {
        it('should return all unique assets across symbols', () => {
            const s1 = new Symbol(getAsset('btc'), getAsset('usdc'))
            const s2 = new Symbol(getAsset('eth'), getAsset('usdc'))
            const s3 = new Symbol(getAsset('eth'), getAsset('usdt'))
            const ex = new Exchange('test', [s1, s2, s3])
            const ids = ex.assets.map(a => a.id)
            expect(ids).to.have.members(['btc', 'eth', 'usdc', 'usdt'])
            expect(ids).to.have.length(4)
        })

        it('should return Asset instances', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            const ex = new Exchange('test', [s])
            for (const a of ex.assets) {
                expect(a).to.be.instanceOf(Asset)
            }
        })

        it('should be sorted alphabetically by id', () => {
            const s1 = new Symbol(getAsset('sol'), getAsset('usdc'))
            const s2 = new Symbol(getAsset('btc'), getAsset('usdt'))
            const s3 = new Symbol(getAsset('eth'), getAsset('usdc'))
            const ex = new Exchange('test', [s1, s2, s3])
            const ids = ex.assets.map(a => a.id)
            expect(ids).to.deep.equal([...ids].sort())
        })

        it('should return empty array for empty exchange', () => {
            expect(new Exchange('test').assets).to.deep.equal([])
        })
    })

    describe('symbol-exchange binding', () => {
        it('should throw if a symbol is added to a second exchange', () => {
            const s = new Symbol(getAsset('btc'), getAsset('usdc'))
            new Exchange('first', [s])
            expect(() => new Exchange('second', [s])).to.throw('already belongs')
        })
    })
})
