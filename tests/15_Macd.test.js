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

    it('should become ready when signal line is available', () => {
        const macd = new Macd(3, 5, 2)
        const prices = [10, 20, 30, 40, 50, 60, 70]
        let result = null
        for (const p of prices) {
            result = macd.update(p)
        }
        expect(macd.isReady).to.equal(true)
        expect(macd.macd).to.not.equal(null)
        expect(macd.signal).to.not.equal(null)
        expect(macd.histogram).to.not.equal(null)
        expect(result).to.equal(macd.histogram)
    })

    it('should compute histogram as macd - signal', () => {
        const macd = new Macd(3, 5, 2)
        for (let i = 0; i < 10; i++) {
            macd.update(100 + i * 5)
        }
        expect(macd.histogram).to.be.closeTo(macd.macd - macd.signal, 1e-10)
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
