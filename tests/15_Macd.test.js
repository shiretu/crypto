import { expect } from 'chai'
import Macd from '../src/instruments/Macd.js'

describe('Macd', () => {
    it('should reject fast >= slow', () => {
        expect(() => new Macd(26, 12, 9)).to.throw('must be less than')
        expect(() => new Macd(12, 12, 9)).to.throw('must be less than')
    })

    it('should use default periods 12, 26, 9', () => {
        const macd = new Macd()
        expect(macd.fastPeriod).to.equal(12)
        expect(macd.slowPeriod).to.equal(26)
        expect(macd.signalPeriod).to.equal(9)
    })

    it('should start with null values and not ready', () => {
        const macd = new Macd()
        expect(macd.macd).to.equal(null)
        expect(macd.signal).to.equal(null)
        expect(macd.histogram).to.equal(null)
        expect(macd.isReady).to.equal(false)
    })

    it('should return null during warmup', () => {
        const macd = new Macd(3, 5, 2)
        for (let i = 0; i < 4; i++) {
            expect(macd.update(100 + i)).to.equal(null)
        }
        expect(macd.isReady).to.equal(false)
    })

    it('should produce macd before signal is ready', () => {
        const macd = new Macd(3, 5, 3)
        // Feed 5 values to get slow EMA ready (macd line starts)
        for (let i = 0; i < 5; i++) {
            macd.update(100 + i)
        }
        // macd line should exist but signal not yet ready
        expect(macd.macd).to.not.equal(null)
    })

    it('should return object with all props when ready', () => {
        const macd = new Macd(3, 5, 2)
        const prices = [10, 20, 30, 40, 50, 60, 70]
        let result = null
        for (const p of prices) {
            result = macd.update(p)
        }
        expect(macd.isReady).to.equal(true)
        expect(result).to.have.all.keys('fast', 'slow', 'macd', 'signal', 'histogram')
        expect(result.fast).to.equal(result.slow + result.macd)
        expect(result.macd).to.equal(result.fast - result.slow)
        expect(result.histogram).to.be.closeTo(result.macd - result.signal, 1e-10)
        expect(result.macd).to.equal(macd.macd)
        expect(result.signal).to.equal(macd.signal)
        expect(result.histogram).to.equal(macd.histogram)
    })

    it('should compute correct values for known sequence', () => {
        const macd = new Macd(3, 5, 2)
        const prices = [100, 105, 102, 110, 108, 115, 112, 120, 118, 125]
        const results = prices.map(p => macd.update(p))

        // First 4 should be null (slow EMA not ready)
        for (let i = 0; i < 4; i++) expect(results[i]).to.equal(null)

        // Index 4: slow EMA ready but signal needs 2 macd values
        expect(results[4]).to.equal(null)

        // Index 5: first ready result
        expect(results[5]).to.have.all.keys('fast', 'slow', 'macd', 'signal', 'histogram')
        expect(results[5].fast).to.be.closeTo(111.041667, 1e-4)
        expect(results[5].slow).to.be.closeTo(108.333333, 1e-4)
        expect(results[5].macd).to.be.closeTo(2.708333, 1e-4)
        expect(results[5].signal).to.be.closeTo(2.395833, 1e-4)
        expect(results[5].histogram).to.be.closeTo(0.312500, 1e-4)

        // Index 6
        expect(results[6].fast).to.be.closeTo(111.520833, 1e-4)
        expect(results[6].slow).to.be.closeTo(109.555556, 1e-4)
        expect(results[6].macd).to.be.closeTo(1.965278, 1e-4)
        expect(results[6].signal).to.be.closeTo(2.108796, 1e-4)
        expect(results[6].histogram).to.be.closeTo(-0.143519, 1e-4)

        // Index 7
        expect(results[7].fast).to.be.closeTo(115.760417, 1e-4)
        expect(results[7].slow).to.be.closeTo(113.037037, 1e-4)
        expect(results[7].macd).to.be.closeTo(2.723380, 1e-4)
        expect(results[7].signal).to.be.closeTo(2.518519, 1e-4)
        expect(results[7].histogram).to.be.closeTo(0.204861, 1e-4)

        // Index 8
        expect(results[8].fast).to.be.closeTo(116.880208, 1e-4)
        expect(results[8].slow).to.be.closeTo(114.691358, 1e-4)
        expect(results[8].macd).to.be.closeTo(2.188850, 1e-4)
        expect(results[8].signal).to.be.closeTo(2.298740, 1e-4)
        expect(results[8].histogram).to.be.closeTo(-0.109889, 1e-4)

        // Index 9
        expect(results[9].fast).to.be.closeTo(120.940104, 1e-4)
        expect(results[9].slow).to.be.closeTo(118.127572, 1e-4)
        expect(results[9].macd).to.be.closeTo(2.812532, 1e-4)
        expect(results[9].signal).to.be.closeTo(2.641268, 1e-4)
        expect(results[9].histogram).to.be.closeTo(0.171264, 1e-4)
    })

    it('should converge to zero on flat prices', () => {
        const macd = new Macd(3, 5, 2)
        for (let i = 0; i < 100; i++) {
            macd.update(100)
        }
        expect(macd.macd).to.be.closeTo(0, 0.01)
        expect(macd.signal).to.be.closeTo(0, 0.01)
        expect(macd.histogram).to.be.closeTo(0, 0.01)
    })

    it('should reset to initial state', () => {
        const macd = new Macd(3, 5, 2)
        for (let i = 0; i < 10; i++) macd.update(100 + i)
        expect(macd.isReady).to.equal(true)
        macd.reset()
        expect(macd.macd).to.equal(null)
        expect(macd.signal).to.equal(null)
        expect(macd.histogram).to.equal(null)
        expect(macd.isReady).to.equal(false)
    })
})
