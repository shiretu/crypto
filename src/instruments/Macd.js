import Ema from './Ema.js'

export default class Macd {
    #fastEma
    #slowEma
    #signalEma
    #macd
    #signal
    #histogram

    constructor (fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (fastPeriod >= slowPeriod) {
            throw new Error(`Fast period (${fastPeriod}) must be less than slow period (${slowPeriod})`)
        }
        this.#fastEma = new Ema(fastPeriod)
        this.#slowEma = new Ema(slowPeriod)
        this.#signalEma = new Ema(signalPeriod)
        this.#macd = null
        this.#signal = null
        this.#histogram = null
    }

    get fastPeriod () { return this.#fastEma.period }
    get slowPeriod () { return this.#slowEma.period }
    get signalPeriod () { return this.#signalEma.period }
    get macd () { return this.#macd }
    get signal () { return this.#signal }
    get histogram () { return this.#histogram }
    get isReady () { return this.#histogram !== null }

    update (price) {
        const fast = this.#fastEma.update(price)
        const slow = this.#slowEma.update(price)
        if (fast === null || slow === null) return null

        this.#macd = fast - slow
        const sig = this.#signalEma.update(this.#macd)
        if (sig === null) return null

        this.#signal = sig
        this.#histogram = this.#macd - this.#signal
        return { fast, slow, macd: this.#macd, signal: this.#signal, histogram: this.#histogram }
    }

    reset () {
        this.#fastEma.reset()
        this.#slowEma.reset()
        this.#signalEma.reset()
        this.#macd = null
        this.#signal = null
        this.#histogram = null
    }
}
