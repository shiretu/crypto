export default class Day {
    static normalize ({ year, month, day }) {
        const d = new Date(Date.UTC(year, month - 1, day))
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }

    static toStr ({ year, month, day }) {
        const n = Day.normalize({ year, month, day })
        return `${n.year}-${String(n.month).padStart(2, '0')}-${String(n.day).padStart(2, '0')}`
    }

    static fromStr (str) {
        const match = str.match(/^(\d{4})(?:\s*-\s*|\s+)(\d{2})(?:(?:\s*-\s*|\s+)(\d{2}))?$/)
        if (!match) throw new Error(`Invalid date format: ${str}`)
        const date = { year: parseInt(match[1]), month: parseInt(match[2]), day: match[3] ? parseInt(match[3]) : 1 }
        return Day.normalize(date)
    }

    static fromTsUs (tsUs) {
        const d = new Date(Math.floor(tsUs / 1000))
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }

    static compare (a, b) {
        return (a.year - b.year) || (a.month - b.month) || (a.day - b.day)
    }

    static toMonth ({ year, month }) { return Day.normalize({ year, month, day: 1 }) }

    static toYear ({ year }) { return { year, month: 1, day: 1 } }

    static offsetByDays ({ year, month, day }, days) {
        const d = new Date(Date.UTC(year, month - 1, day + days))
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }

    static offsetByMonths ({ year, month, day }, months) {
        const d = new Date(Date.UTC(year, month - 1 + months, day))
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }

    static offsetByYears ({ year, month, day }, years) {
        const d = new Date(Date.UTC(year + years, month - 1, day))
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }

    static nextDay (date) { return Day.offsetByDays(date, 1) }

    static prevDay (date) { return Day.offsetByDays(date, -1) }

    static today () {
        const d = new Date()
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }

    static yesterday () { return Day.prevDay(Day.today()) }

    static tomorrow () { return Day.nextDay(Day.today()) }

    static thisMonth () { return Day.toMonth(Day.today()) }

    static thisYear () { return Day.toYear(Day.today()) }
}
