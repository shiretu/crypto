export const dateStr = (year, month, day) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export const nextDay = (year, month, day) => {
    const d = new Date(Date.UTC(year, month - 1, day + 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export const compareDates = (a, b) =>
    (a.year - b.year) || (a.month - b.month) || (a.day - b.day)

export const parseDate = (str) => {
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) }
    const matchMonth = str.match(/^(\d{4})-(\d{2})$/)
    if (matchMonth) return { year: parseInt(matchMonth[1]), month: parseInt(matchMonth[2]), day: 1 }
    throw new Error(`Invalid date format: ${str} (expected YYYY-MM-DD or YYYY-MM)`)
}

export const yesterday = () => {
    const d = new Date(Date.now() - 86400000)
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export const lastMonth = () => {
    const now = new Date()
    let year = now.getUTCFullYear()
    let month = now.getUTCMonth() // 0-indexed = previous month in 1-indexed
    if (month === 0) { year--; month = 12 } 
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return {
        start: { year, month, day: 1 },
        end: { year, month, day: lastDay }
    }
}

export const fmtDate = (d) => dateStr(d.year, d.month, d.day)
