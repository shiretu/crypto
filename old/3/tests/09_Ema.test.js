import { expect } from 'chai'
import Ema from '../src/instruments/Ema.js'

describe('Ema', () => {
    it('should reject invalid period', () => {
        expect(() => new Ema(0)).to.throw('Invalid EMA period')
        expect(() => new Ema(-1)).to.throw('Invalid EMA period')
        expect(() => new Ema(1.5)).to.throw('Invalid EMA period')
    })

    it('should start with null value and not ready', () => {
        const ema = new Ema(10)
        expect(ema.value).to.equal(null)
        expect(ema.isReady).to.equal(false)
        expect(ema.period).to.equal(10)
    })

    it('should return null during warmup', () => {
        const ema = new Ema(3)
        expect(ema.update(10)).to.equal(null)
        expect(ema.update(20)).to.equal(null)
        expect(ema.isReady).to.equal(false)
    })

    it('should seed with SMA of first period values', () => {
        const ema = new Ema(3)
        ema.update(10)
        ema.update(20)
        expect(ema.update(30)).to.equal(20)
        expect(ema.isReady).to.equal(true)
    })

    it('should compute EMA after seed', () => {
        const ema = new Ema(3)
        ema.update(10)
        ema.update(20)
        ema.update(30)
        const multiplier = 2 / (3 + 1)
        const expected = (40 - 20) * multiplier + 20
        expect(ema.update(40)).to.be.closeTo(expected, 1e-10)
    })

    it('should work with period 1', () => {
        const ema = new Ema(1)
        expect(ema.update(10)).to.equal(10)
        expect(ema.update(20)).to.equal(20)
        expect(ema.update(30)).to.equal(30)
    })

    it('should compute correct values for known sequence', () => {
        const ema = new Ema(3)
        const prices = [100, 105, 102, 110, 108, 115, 112, 120]
        const results = prices.map(p => ema.update(p))

        expect(results[0]).to.equal(null)
        expect(results[1]).to.equal(null)
        expect(results[2]).to.be.closeTo(102.333333, 1e-4)
        expect(results[3]).to.be.closeTo(106.166667, 1e-4)
        expect(results[4]).to.be.closeTo(107.083333, 1e-4)
        expect(results[5]).to.be.closeTo(111.041667, 1e-4)
        expect(results[6]).to.be.closeTo(111.520833, 1e-4)
        expect(results[7]).to.be.closeTo(115.760417, 1e-4)
    })

    it('should converge towards repeated price', () => {
        const ema = new Ema(10)
        for (let i = 0; i < 200; i++) ema.update(50)
        expect(ema.value).to.be.closeTo(50, 0.01)
    })

    it('should reset to initial state', () => {
        const ema = new Ema(3)
        ema.update(10)
        ema.update(20)
        ema.update(30)
        ema.reset()
        expect(ema.value).to.equal(null)
        expect(ema.isReady).to.equal(false)
        expect(ema.update(100)).to.equal(null)
        expect(ema.update(200)).to.equal(null)
        expect(ema.update(300)).to.equal(200)
    })
})
