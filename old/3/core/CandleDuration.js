const CandleDuration = Object.freeze({
    MIN_1: 60,
    MIN_5: 300,
    MIN_15: 900,
    MIN_30: 1800,
    HOUR_1: 3600,
    HOUR_4: 14400
})

const VALID_DURATIONS = new Set(Object.values(CandleDuration))

export const isValidDuration = (sec) => VALID_DURATIONS.has(sec)

export default CandleDuration
