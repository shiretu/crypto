import { expect } from 'chai'
import Day from '../src/utils/Day.js'

describe('Day', () => {
    describe('normalize', () => {
        it('should return same date for valid dates', () => {
            expect(Day.normalize({ year: 2024, month: 1, day: 15 })).to.deep.equal({ year: 2024, month: 1, day: 15 })
            expect(Day.normalize({ year: 2024, month: 12, day: 31 })).to.deep.equal({ year: 2024, month: 12, day: 31 })
        })

        it('should keep leap day', () => {
            expect(Day.normalize({ year: 2024, month: 2, day: 29 })).to.deep.equal({ year: 2024, month: 2, day: 29 })
        })

        it('should wrap Feb 29 on non-leap year to Mar 1', () => {
            expect(Day.normalize({ year: 2025, month: 2, day: 29 })).to.deep.equal({ year: 2025, month: 3, day: 1 })
        })

        it('should wrap day 0 to previous month last day', () => {
            expect(Day.normalize({ year: 2024, month: 1, day: 0 })).to.deep.equal({ year: 2023, month: 12, day: 31 })
        })

        it('should wrap day 32 in January to Feb 1', () => {
            expect(Day.normalize({ year: 2024, month: 1, day: 32 })).to.deep.equal({ year: 2024, month: 2, day: 1 })
        })

        it('should wrap month 0 to previous year December', () => {
            expect(Day.normalize({ year: 2024, month: 0, day: 1 })).to.deep.equal({ year: 2023, month: 12, day: 1 })
        })

        it('should wrap month 13 to next year January', () => {
            expect(Day.normalize({ year: 2024, month: 13, day: 1 })).to.deep.equal({ year: 2025, month: 1, day: 1 })
        })

        it('should wrap day 45 in January to Feb 14', () => {
            expect(Day.normalize({ year: 2024, month: 1, day: 45 })).to.deep.equal({ year: 2024, month: 2, day: 14 })
        })

        it('should wrap month 99', () => {
            expect(Day.normalize({ year: 2024, month: 99, day: 1 })).to.deep.equal({ year: 2032, month: 3, day: 1 })
        })
    })

    describe('toStr', () => {
        it('should format with zero padding', () => {
            expect(Day.toStr({ year: 2024, month: 1, day: 5 })).to.equal('2024-01-05')
        })

        it('should format without padding when not needed', () => {
            expect(Day.toStr({ year: 2024, month: 12, day: 31 })).to.equal('2024-12-31')
        })

        it('should handle single digit month and day', () => {
            expect(Day.toStr({ year: 2025, month: 3, day: 7 })).to.equal('2025-03-07')
        })
    })

    describe('fromStr', () => {
        it('should parse dash-separated date', () => {
            expect(Day.fromStr('2024-01-15')).to.deep.equal({ year: 2024, month: 1, day: 15 })
        })

        it('should parse space-separated date', () => {
            expect(Day.fromStr('2024 01 15')).to.deep.equal({ year: 2024, month: 1, day: 15 })
        })

        it('should parse spaces around dash', () => {
            expect(Day.fromStr('2024 - 01 - 15')).to.deep.equal({ year: 2024, month: 1, day: 15 })
        })

        it('should parse multiple spaces around dash', () => {
            expect(Day.fromStr('2024  -  01  -  15')).to.deep.equal({ year: 2024, month: 1, day: 15 })
        })

        it('should parse multiple spaces without dash', () => {
            expect(Day.fromStr('2024   01   15')).to.deep.equal({ year: 2024, month: 1, day: 15 })
        })

        it('should parse space before dash only', () => {
            expect(Day.fromStr('2024 -01 -15')).to.deep.equal({ year: 2024, month: 1, day: 15 })
        })

        it('should parse space after dash only', () => {
            expect(Day.fromStr('2024- 01- 15')).to.deep.equal({ year: 2024, month: 1, day: 15 })
        })

        it('should normalize invalid date values', () => {
            expect(Day.fromStr('2025-02-29')).to.deep.equal({ year: 2025, month: 3, day: 1 })
        })

        it('should default day to 1 when omitted with dash', () => {
            expect(Day.fromStr('2024-03')).to.deep.equal({ year: 2024, month: 3, day: 1 })
        })

        it('should default day to 1 when omitted with space', () => {
            expect(Day.fromStr('2024 03')).to.deep.equal({ year: 2024, month: 3, day: 1 })
        })

        it('should reject single digit month', () => {
            expect(() => Day.fromStr('2024-1-15')).to.throw('Invalid date format')
        })

        it('should reject single digit day', () => {
            expect(() => Day.fromStr('2024-01-5')).to.throw('Invalid date format')
        })

        it('should reject no separator', () => {
            expect(() => Day.fromStr('20240115')).to.throw('Invalid date format')
        })
    })

    describe('prev', () => {
        it('should go to previous day within month', () => {
            expect(Day.prevDay({ year: 2024, month: 3, day: 15 })).to.deep.equal({ year: 2024, month: 3, day: 14 })
        })

        it('should cross month boundary', () => {
            expect(Day.prevDay({ year: 2024, month: 3, day: 1 })).to.deep.equal({ year: 2024, month: 2, day: 29 })
        })

        it('should cross year boundary', () => {
            expect(Day.prevDay({ year: 2025, month: 1, day: 1 })).to.deep.equal({ year: 2024, month: 12, day: 31 })
        })
    })
})
