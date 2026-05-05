import { expect } from 'chai'
import Day, { compareDates, parseDate, yesterday } from '../src/utils/Day.js'

describe('date utils', () => {
    it('should format dateStr with zero padding', () => {
        expect(Day.toStr({ year: 2024, month: 1, day: 5 })).to.equal('2024-01-05')
        expect(Day.toStr({ year: 2024, month: 12, day: 31 })).to.equal('2024-12-31')
    })

    it('should compute nextDay within month', () => {
        const n = Day.nextDay({ year: 2024, month: 1, day: 15 })
        expect(n).to.deep.equal({ year: 2024, month: 1, day: 16 })
    })

    it('should compute nextDay across month boundary', () => {
        const n = Day.nextDay({ year: 2024, month: 1, day: 31 })
        expect(n).to.deep.equal({ year: 2024, month: 2, day: 1 })
    })

    it('should compute nextDay across year boundary', () => {
        const n = Day.nextDay({ year: 2024, month: 12, day: 31 })
        expect(n).to.deep.equal({ year: 2025, month: 1, day: 1 })
    })

    it('should compare dates correctly', () => {
        expect(compareDates({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 2 })).to.be.lessThan(0)
        expect(compareDates({ year: 2024, month: 1, day: 2 }, { year: 2024, month: 1, day: 1 })).to.be.greaterThan(0)
        expect(compareDates({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })).to.equal(0)
        expect(compareDates({ year: 2024, month: 1, day: 1 }, { year: 2025, month: 1, day: 1 })).to.be.lessThan(0)
        expect(compareDates({ year: 2024, month: 6, day: 1 }, { year: 2024, month: 1, day: 1 })).to.be.greaterThan(0)
    })

    it('should parse YYYY-MM-DD', () => {
        expect(parseDate('2024-03-15')).to.deep.equal({ year: 2024, month: 3, day: 15 })
    })

    it('should parse YYYY-MM defaulting to day 1', () => {
        expect(parseDate('2024-03')).to.deep.equal({ year: 2024, month: 3, day: 1 })
    })

    it('should throw on invalid format', () => {
        expect(() => parseDate('2024')).to.throw()
        expect(() => parseDate('abc')).to.throw()
        expect(() => parseDate('')).to.throw()
    })

    it('should return yesterday in UTC', () => {
        const y = yesterday()
        expect(y).to.have.keys('year', 'month', 'day')
        const now = new Date()
        const expected = new Date(Date.now() - 86400000)
        expect(y.year).to.equal(expected.getUTCFullYear())
        expect(y.month).to.equal(expected.getUTCMonth() + 1)
        expect(y.day).to.equal(expected.getUTCDate())
    })

    it('should format fmtDate from date object', () => {
        expect(Day.toStr({ year: 2024, month: 3, day: 5 })).to.equal('2024-03-05')
    })
})
