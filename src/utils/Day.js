/**
 * UTC day arithmetic using microsecond timestamps.
 * All methods (except toStr) return a microsecond timestamp
 * truncated to midnight UTC (00:00:00.000000).
 */
export default class Day {
    /**
     * Parse a date string into a midnight-UTC microsecond timestamp.
     * Separators can be dashes, spaces, or both (any amount of whitespace around dashes).
     * Day is optional and defaults to 1.
     * Examples: '2024-01-15', '2024 01 15', '2024 - 01 - 15', '2024-03'
     * @param {string} str - date string (e.g. '2024-01-15', '2024 01', '2024 - 03 - 07')
     * @returns {number} tsUs at midnight UTC
     * @throws {Error} if the format is invalid
     */
    static fromStr (str) {
        const match = str.match(/^(\d{4})(?:\s*-\s*|\s+)(\d{2})(?:(?:\s*-\s*|\s+)(\d{2}))?$/)
        if (!match) throw new Error(`Invalid date format: ${str}`)
        const year = parseInt(match[1])
        const month = parseInt(match[2])
        const day = match[3] ? parseInt(match[3]) : 1
        const date = new Date(Date.UTC(year, month - 1, day))
        return date.getTime() * 1000
    }

    /**
     * Truncate an arbitrary microsecond timestamp to midnight UTC of that day.
     * @param {number} tsUs - microsecond timestamp
     * @returns {number} tsUs at midnight UTC
     */
    static fromTsUs (tsUs) {
        const usPerDay = 24 * 3600 * 1000 * 1000
        return Math.floor(tsUs / usPerDay) * usPerDay
    }

    /**
     * Format a microsecond timestamp as a YYYY-MM-DD string (UTC).
     * @param {number} tsUs - microsecond timestamp
     * @returns {string}
     */
    static toStr (tsUs) {
        const date = new Date(Math.floor(tsUs / 1000))
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    }

    /**
     * Truncate to the first day of the month (midnight UTC).
     * @param {number} tsUs - microsecond timestamp
     * @returns {number} tsUs at midnight UTC of the 1st of that month
     */
    static toMonth (tsUs) {
        const date = new Date(Math.floor(tsUs / 1000))
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) * 1000
    }

    /**
     * Truncate to January 1st of the year (midnight UTC).
     * @param {number} tsUs - microsecond timestamp
     * @returns {number} tsUs at midnight UTC of Jan 1 of that year
     */
    static toYear (tsUs) {
        const date = new Date(Math.floor(tsUs / 1000))
        return Date.UTC(date.getUTCFullYear(), 0, 1) * 1000
    }

    /**
     * Offset a timestamp by a number of days.
     * @param {number} tsUs - microsecond timestamp
     * @param {number} days - number of days to offset (can be negative)
     * @returns {number} tsUs at midnight UTC of the resulting day
     */
    static offsetByDays (tsUs, days) {
        return Day.fromTsUs(tsUs) + days * 24 * 60 * 60 * 1000 * 1000
    }

    /**
     * Offset a timestamp by a number of months.
     * @param {number} tsUs - microsecond timestamp
     * @param {number} months - number of months to offset (can be negative)
     * @returns {number} tsUs at midnight UTC of the resulting day
     */
    static offsetByMonths (tsUs, months) {
        const d = new Date(Day.fromTsUs(tsUs) / 1000)
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())).getTime() * 1000
    }

    /**
     * Offset a timestamp by a number of years.
     * @param {number} tsUs - microsecond timestamp
     * @param {number} years - number of years to offset (can be negative)
     * @returns {number} tsUs at midnight UTC of the resulting day
     */
    static offsetByYears (tsUs, years) {
        const d = new Date(Day.fromTsUs(tsUs) / 1000)
        return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate())).getTime() * 1000
    }

    /** @returns {number} tsUs at midnight UTC of the next day */
    static nextDay (tsUs) { return Day.offsetByDays(tsUs, 1) }

    /** @returns {number} tsUs at midnight UTC of the previous day */
    static prevDay (tsUs) { return Day.offsetByDays(tsUs, -1) }

    /** @returns {number} tsUs at midnight UTC of today */
    static today () { return Day.fromTsUs(Date.now() * 1000) }

    /** @returns {number} tsUs at midnight UTC of yesterday */
    static yesterday () { return Day.offsetByDays(Date.now() * 1000, -1) }

    /** @returns {number} tsUs at midnight UTC of tomorrow */
    static tomorrow () { return Day.offsetByDays(Date.now() * 1000, 1) }

    /** @returns {number} tsUs at midnight UTC of the 1st of this month */
    static thisMonth () { return Day.toMonth(Date.now() * 1000) }

    /** @returns {number} tsUs at midnight UTC of Jan 1 of this year */
    static thisYear () { return Day.toYear(Date.now() * 1000) }
}
