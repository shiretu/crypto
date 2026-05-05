import Day from '../utils/Day.js'

export const lastMonth = () => ({
    start: Day.offsetByMonths(Day.thisMonth(), -1),
    end: Day.prevDay(Day.thisMonth())
})
