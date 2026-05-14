const CandleDuration = Object.freeze({
    SEC_5: 5,
    SEC_10: 10,
    SEC_30: 30,
    MIN_1: 60,
    MIN_5: 300,
    MIN_15: 900,
    MIN_30: 1800,
    HOUR_1: 3600,
    HOUR_4: 14400
})

const VALID_DURATIONS = new Set(Object.values(CandleDuration).filter(v => typeof v === 'number' && v > 0 && (24 * 3600) % v === 0))

export const isValidDuration = (sec) => VALID_DURATIONS.has(sec)

export default CandleDuration
