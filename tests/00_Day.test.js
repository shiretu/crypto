import { expect } from 'chai'
import Day from '../src/utils/Day.js'

// Helper: midnight UTC microseconds for a given date
const utc = (y, m, d) => Date.UTC(y, m - 1, d) * 1000

describe('Day', () => {
    describe('fromStr', () => {
        it('should parse dash-separated date', () => {
            expect(Day.fromStr('2024-01-15')).to.equal(utc(2024, 1, 15))
        })

        it('should parse space-separated date', () => {
            expect(Day.fromStr('2024 01 15')).to.equal(utc(2024, 1, 15))
        })

        it('should parse spaces around dash', () => {
            expect(Day.fromStr('2024 - 01 - 15')).to.equal(utc(2024, 1, 15))
        })

        it('should parse multiple spaces around dash', () => {
            expect(Day.fromStr('2024  -  01  -  15')).to.equal(utc(2024, 1, 15))
        })

        it('should parse multiple spaces without dash', () => {
            expect(Day.fromStr('2024   01   15')).to.equal(utc(2024, 1, 15))
        })

        it('should parse space before dash only', () => {
            expect(Day.fromStr('2024 -01 -15')).to.equal(utc(2024, 1, 15))
        })

        it('should parse space after dash only', () => {
            expect(Day.fromStr('2024- 01- 15')).to.equal(utc(2024, 1, 15))
        })

        it('should default day to 1 when omitted with dash', () => {
            expect(Day.fromStr('2024-03')).to.equal(utc(2024, 3, 1))
        })

        it('should default day to 1 when omitted with space', () => {
            expect(Day.fromStr('2024 03')).to.equal(utc(2024, 3, 1))
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

        it('should reject empty string', () => {
            expect(() => Day.fromStr('')).to.throw('Invalid date format')
        })

        it('should reject year only', () => {
            expect(() => Day.fromStr('2024')).to.throw('Invalid date format')
        })
    })

    describe('usPerDay', () => {
        it('should be 86400 seconds worth of microseconds', () => {
            expect(Day.usPerDay).to.equal(86_400_000_000)
        })
    })

    describe('fromTsUs', () => {
        it('should truncate to midnight UTC', () => {
            const midday = utc(2024, 6, 15) + 12 * 3600 * 1_000_000
            expect(Day.fromTsUs(midday)).to.equal(utc(2024, 6, 15))
        })

        it('should keep midnight unchanged', () => {
            const midnight = utc(2024, 1, 1)
            expect(Day.fromTsUs(midnight)).to.equal(midnight)
        })

        it('should truncate 1 microsecond before midnight to previous day', () => {
            const justBefore = utc(2024, 3, 15) - 1
            expect(Day.fromTsUs(justBefore)).to.equal(utc(2024, 3, 14))
        })

        it('should truncate last microsecond of the day', () => {
            const lastUs = utc(2024, 7, 20) + Day.usPerDay - 1
            expect(Day.fromTsUs(lastUs)).to.equal(utc(2024, 7, 20))
        })
    })

    describe('toStr', () => {
        it('should format with zero padding', () => {
            expect(Day.toStr(utc(2024, 1, 5))).to.equal('2024-01-05')
        })

        it('should format without padding when not needed', () => {
            expect(Day.toStr(utc(2024, 12, 31))).to.equal('2024-12-31')
        })

        it('should format mid-day timestamp using its UTC date', () => {
            const midday = utc(2025, 3, 7) + 15 * 3600 * 1_000_000
            expect(Day.toStr(midday)).to.equal('2025-03-07')
        })
    })

    describe('toMonth', () => {
        it('should truncate to 1st of the month', () => {
            expect(Day.toMonth(utc(2024, 6, 15))).to.equal(utc(2024, 6, 1))
        })

        it('should keep 1st unchanged', () => {
            expect(Day.toMonth(utc(2024, 1, 1))).to.equal(utc(2024, 1, 1))
        })
    })

    describe('toYear', () => {
        it('should truncate to Jan 1', () => {
            expect(Day.toYear(utc(2024, 8, 20))).to.equal(utc(2024, 1, 1))
        })

        it('should keep Jan 1 unchanged', () => {
            expect(Day.toYear(utc(2024, 1, 1))).to.equal(utc(2024, 1, 1))
        })
    })

    describe('offsetByDays', () => {
        it('should offset forward', () => {
            expect(Day.offsetByDays(utc(2024, 1, 15), 3)).to.equal(utc(2024, 1, 18))
        })

        it('should offset backward', () => {
            expect(Day.offsetByDays(utc(2024, 3, 1), -1)).to.equal(utc(2024, 2, 29))
        })

        it('should cross month boundary', () => {
            expect(Day.offsetByDays(utc(2024, 1, 31), 1)).to.equal(utc(2024, 2, 1))
        })

        it('should cross year boundary', () => {
            expect(Day.offsetByDays(utc(2024, 12, 31), 1)).to.equal(utc(2025, 1, 1))
        })

        it('should truncate input before offsetting', () => {
            const midday = utc(2024, 1, 15) + 12 * 3600 * 1_000_000
            expect(Day.offsetByDays(midday, 1)).to.equal(utc(2024, 1, 16))
        })

        it('should handle zero offset', () => {
            expect(Day.offsetByDays(utc(2024, 5, 10), 0)).to.equal(utc(2024, 5, 10))
        })
    })

    describe('offsetByMonths', () => {
        it('should offset forward', () => {
            expect(Day.offsetByMonths(utc(2024, 1, 15), 2)).to.equal(utc(2024, 3, 15))
        })

        it('should offset backward', () => {
            expect(Day.offsetByMonths(utc(2024, 3, 15), -1)).to.equal(utc(2024, 2, 15))
        })

        it('should cross year boundary', () => {
            expect(Day.offsetByMonths(utc(2024, 11, 1), 3)).to.equal(utc(2025, 2, 1))
        })
    })

    describe('offsetByYears', () => {
        it('should offset forward', () => {
            expect(Day.offsetByYears(utc(2024, 6, 15), 2)).to.equal(utc(2026, 6, 15))
        })

        it('should offset backward', () => {
            expect(Day.offsetByYears(utc(2024, 6, 15), -1)).to.equal(utc(2023, 6, 15))
        })
    })

    describe('nextDay', () => {
        it('should return the next day', () => {
            expect(Day.nextDay(utc(2024, 1, 15))).to.equal(utc(2024, 1, 16))
        })

        it('should cross month boundary', () => {
            expect(Day.nextDay(utc(2024, 1, 31))).to.equal(utc(2024, 2, 1))
        })

        it('should cross year boundary', () => {
            expect(Day.nextDay(utc(2024, 12, 31))).to.equal(utc(2025, 1, 1))
        })
    })

    describe('prevDay', () => {
        it('should return the previous day', () => {
            expect(Day.prevDay(utc(2024, 3, 15))).to.equal(utc(2024, 3, 14))
        })

        it('should cross month boundary', () => {
            expect(Day.prevDay(utc(2024, 3, 1))).to.equal(utc(2024, 2, 29))
        })

        it('should cross year boundary', () => {
            expect(Day.prevDay(utc(2025, 1, 1))).to.equal(utc(2024, 12, 31))
        })
    })

    describe('today / yesterday / tomorrow', () => {
        it('today should be midnight UTC of current day', () => {
            const now = Date.now() * 1000
            expect(Day.today()).to.equal(Day.fromTsUs(now))
        })

        it('yesterday should be one day before today', () => {
            expect(Day.yesterday()).to.equal(Day.offsetByDays(Day.today(), -1))
        })

        it('tomorrow should be one day after today', () => {
            expect(Day.tomorrow()).to.equal(Day.offsetByDays(Day.today(), 1))
        })
    })

    describe('thisMonth / thisYear', () => {
        it('thisMonth should be 1st of current month', () => {
            expect(Day.thisMonth()).to.equal(Day.toMonth(Day.today()))
        })

        it('thisYear should be Jan 1 of current year', () => {
            expect(Day.thisYear()).to.equal(Day.toYear(Day.today()))
        })
    })

    describe('roundtrip', () => {
        it('fromStr and toStr should roundtrip', () => {
            expect(Day.toStr(Day.fromStr('2024-06-15'))).to.equal('2024-06-15')
            expect(Day.toStr(Day.fromStr('2025-12-31'))).to.equal('2025-12-31')
            expect(Day.toStr(Day.fromStr('2024-01'))).to.equal('2024-01-01')
        })
    })
})
