import { expect } from 'chai'
import CandleDuration, { isValidDuration } from '../src/core/CandleDuration.js'

describe('CandleDuration', () => {
    describe('enum values', () => {
        it('should expose seconds-based durations', () => {
            expect(CandleDuration.SEC_5).to.equal(5)
            expect(CandleDuration.SEC_10).to.equal(10)
            expect(CandleDuration.SEC_30).to.equal(30)
        })

        it('should expose minute-based durations', () => {
            expect(CandleDuration.MIN_1).to.equal(60)
            expect(CandleDuration.MIN_5).to.equal(300)
            expect(CandleDuration.MIN_15).to.equal(900)
            expect(CandleDuration.MIN_30).to.equal(1800)
        })

        it('should expose hour-based durations', () => {
            expect(CandleDuration.HOUR_1).to.equal(3600)
            expect(CandleDuration.HOUR_4).to.equal(14400)
        })

        it('should be frozen', () => {
            expect(Object.isFrozen(CandleDuration)).to.equal(true)
        })

        it('should not allow mutation', () => {
            expect(() => { CandleDuration.SEC_5 = 99 }).to.throw()
        })
    })

    describe('isValidDuration', () => {
        it('should accept all enum values', () => {
            for (const v of Object.values(CandleDuration)) {
                expect(isValidDuration(v)).to.equal(true)
            }
        })

        it('should reject unknown duration', () => {
            expect(isValidDuration(7)).to.equal(false)
            expect(isValidDuration(120)).to.equal(false)
            expect(isValidDuration(7200)).to.equal(false)
        })

        it('should reject zero and negative durations', () => {
            expect(isValidDuration(0)).to.equal(false)
            expect(isValidDuration(-5)).to.equal(false)
        })

        it('should reject non-numbers', () => {
            expect(isValidDuration('5')).to.equal(false)
            expect(isValidDuration(null)).to.equal(false)
            expect(isValidDuration(undefined)).to.equal(false)
        })
    })

    describe('day-boundary invariant', () => {
        const SECS_PER_DAY = 86400

        it('every allowed duration should divide a day evenly (so no candle can straddle a day boundary)', () => {
            for (const [name, sec] of Object.entries(CandleDuration)) {
                expect(SECS_PER_DAY % sec, `${name}=${sec}s must divide ${SECS_PER_DAY}`).to.equal(0)
            }
        })

        it('should reject durations that do not divide a day evenly', () => {
            // 7s, 11s, 17s, 23s — small primes that don't divide 86400
            expect(isValidDuration(7)).to.equal(false)
            expect(isValidDuration(11)).to.equal(false)
            expect(isValidDuration(17)).to.equal(false)
            expect(isValidDuration(23)).to.equal(false)
            // 7m = 420s -> 86400 / 420 = 205.71... not a divisor
            expect(isValidDuration(420)).to.equal(false)
            // 11m = 660s -> not a divisor
            expect(isValidDuration(660)).to.equal(false)
            // 2h = 7200s — IS a divisor but happens not to be in the allowed set,
            // covered elsewhere; here we only assert the non-divisor case.
        })

        it('should reject durations larger than a day even if they are factors-related', () => {
            // 25h, 2 days etc. — would always span a day.
            expect(isValidDuration(SECS_PER_DAY + 1)).to.equal(false)
            expect(isValidDuration(SECS_PER_DAY * 2)).to.equal(false)
        })
    })
})
