const Ema = require('./ema')

class Macd {
    #shortEma /** @type {Ema} */
    #longEma /** @type {Ema} */
    #signalEma /** @type {Ema} */
    #currentValue /** @type {{ short: number, long: number, macd: number, signal: number, histogram: number } | null} */ = null

    /**
     * Create MACD indicator
     * @param {number} shortPeriod
     * @param {number} longPeriod
     * @param {number} signalPeriod
     */
    constructor (shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
        this.#shortEma = new Ema(shortPeriod)
        this.#longEma = new Ema(longPeriod)
        this.#signalEma = new Ema(signalPeriod)
    }

    /**
     * Get short period
     * @returns {number}
     */
    get shortPeriod () { return this.#shortEma.period }

    /**
     * Get long period
     * @returns {number}
     */
    get longPeriod () { return this.#longEma.period }

    /**
     * Get signal period
     * @returns {number}
     */
    get signalPeriod () { return this.#signalEma.period }

    /**
     * Get MACD readiness
     * @returns {boolean}
     */
    get isReady () { return this.#signalEma.isReady }

    /**
     * Get current MACD value
     * @returns {{ short: number, long: number, macd: number, signal: number, histogram: number } | null}
     */
    get value () { return this.#currentValue }

    /**
     * Push new price value
     * @param {number} value
     * @returns {{ short: number, long: number, macd: number, signal: number, histogram: number } | null}
     */
    push (value) {
        const short = this.#shortEma.push(value)
        const long = this.#longEma.push(value)
        if (short == null || long == null) { return null }
        const macd = short - long
        const signal = this.#signalEma.push(macd)
        if (signal == null) { return null }
        this.#currentValue = { short, long, macd, signal, histogram: macd - signal }
        return this.#currentValue
    }

    /**
     * Simulate MACD calculation without pushing the value
     * @param {number} value
     * @returns {{ short: number, long: number, macd: number, signal: number, histogram: number } | null}
     */
    simulate (value) {
        const short = this.#shortEma.simulate(value)
        const long = this.#longEma.simulate(value)
        if (short == null || long == null) { return null }
        const macd = short - long
        const signal = this.#signalEma.simulate(macd)
        if (signal == null) { return null }
        return { short, long, macd, signal, histogram: macd - signal }
    }
}

module.exports = Macd
