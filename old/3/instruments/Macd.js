import Ema from './Ema.js'

export default class Macd {
    #fastEma
    #slowEma
    #signalEma
    #value

    constructor ({ fast = 12, slow = 26, signal = 9 }) {
        if (fast >= slow) {
            throw new Error(`Fast period (${fast}) must be less than slow period (${slow})`)
        }
        this.#fastEma = new Ema(fast)
        this.#slowEma = new Ema(slow)
        this.#signalEma = new Ema(signal)
        this.#value = null
    }

    get periods () { return { fast: this.#fastEma.period, slow: this.#slowEma.period, signal: this.#signalEma.period } }
    get isReady () { return this.#value !== null }
    get value () { return this.#value }

    update (price) {
        const fast = this.#fastEma.update(price)
        const slow = this.#slowEma.update(price)
        if (fast === null || slow === null) return null

        const macd = fast - slow
        const signal = this.#signalEma.update(macd)
        if (signal === null) return null

        this.#value = { fast, slow, macd, signal, histogram: macd - signal }
        return this.#value
    }

    reset () {
        this.#fastEma.reset()
        this.#slowEma.reset()
        this.#signalEma.reset()
        this.#value = null
    }
}
