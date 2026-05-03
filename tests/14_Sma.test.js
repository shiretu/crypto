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
