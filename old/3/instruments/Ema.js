import Sma from './Sma.js'

export default class Ema {
    #period
    #multiplier
    #value
    #sma

    constructor (period) {
        if (!Number.isInteger(period) || period < 1) {
            throw new Error(`Invalid EMA period: ${period}`)
        }
        this.#period = period
        this.#multiplier = 2 / (period + 1)
        this.#value = null
        this.#sma = new Sma(period)
    }

    get period () { return this.#period }
    get value () { return this.#value }
    get isReady () { return this.#value !== null }

    update (price) {
        if (this.#value === null) {
            const smaValue = this.#sma.update(price)
            if (smaValue === null) return null
            this.#value = smaValue
            this.#sma = null
        } else {
            this.#value = (price - this.#value) * this.#multiplier + this.#value
        }
        return this.#value
    }

    reset () {
        this.#value = null
        this.#sma = new Sma(this.#period)
    }
}
