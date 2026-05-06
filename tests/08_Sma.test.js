import { expect } from 'chai'
import Sma from '../src/instruments/Sma.js'

describe('Sma', () => {
    it('should reject invalid period', () => {
        expect(() => new Sma(0)).to.throw('Invalid SMA period')
        expect(() => new Sma(-1)).to.throw('Invalid SMA period')
        expect(() => new Sma(1.5)).to.throw('Invalid SMA period')
    })

    it('should start with null value and not ready', () => {
        const sma = new Sma(3)
        expect(sma.value).to.equal(null)
        expect(sma.isReady).to.equal(false)
        expect(sma.period).to.equal(3)
    })

    it('should return null until period values collected', () => {
        const sma = new Sma(3)
        expect(sma.update(10)).to.equal(null)
        expect(sma.update(20)).to.equal(null)
        expect(sma.isReady).to.equal(false)
    })

    it('should compute average after period values', () => {
        const sma = new Sma(3)
        sma.update(10)
        sma.update(20)
        expect(sma.update(30)).to.equal(20)
        expect(sma.isReady).to.equal(true)
    })

    it('should slide window on subsequent values', () => {
        const sma = new Sma(3)
        sma.update(10)
        sma.update(20)
        sma.update(30)
        expect(sma.update(40)).to.equal(30)
        expect(sma.update(50)).to.equal(40)
    })

    it('should work with period 1', () => {
        const sma = new Sma(1)
        expect(sma.update(42)).to.equal(42)
        expect(sma.update(100)).to.equal(100)
    })

    it('should converge on repeated value', () => {
        const sma = new Sma(5)
        for (let i = 0; i < 10; i++) sma.update(50)
        expect(sma.value).to.equal(50)
    })

    it('should compute correct values for known sequence', () => {
        const sma = new Sma(3)
        const prices = [100, 105, 102, 110, 108, 115, 112, 120]
        const results = prices.map(p => sma.update(p))

        expect(results[0]).to.equal(null)
        expect(results[1]).to.equal(null)
        expect(results[2]).to.be.closeTo(102.333333, 1e-4)
        expect(results[3]).to.be.closeTo(105.666667, 1e-4)
        expect(results[4]).to.be.closeTo(106.666667, 1e-4)
        expect(results[5]).to.be.closeTo(111.000000, 1e-4)
        expect(results[6]).to.be.closeTo(111.666667, 1e-4)
        expect(results[7]).to.be.closeTo(115.666667, 1e-4)
    })

    it('should reset to initial state', () => {
        const sma = new Sma(3)
        sma.update(10)
        sma.update(20)
        sma.update(30)
        expect(sma.isReady).to.equal(true)
        sma.reset()
        expect(sma.value).to.equal(null)
        expect(sma.isReady).to.equal(false)
        expect(sma.update(100)).to.equal(null)
    })
})
