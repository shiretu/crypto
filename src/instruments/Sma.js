export default class Sma {
    #period
    #values
    #sum
    #value

    constructor (period) {
        if (!Number.isInteger(period) || period < 1) {
            throw new Error(`Invalid SMA period: ${period}`)
        }
        this.#period = period
        this.#values = []
        this.#sum = 0
        this.#value = null
    }

    get period () { return this.#period }
    get value () { return this.#value }
    get isReady () { return this.#value !== null }

    update (price) {
        this.#values.push(price)
        this.#sum += price
        if (this.#values.length > this.#period) {
            this.#sum -= this.#values.shift()
        }
        if (this.#values.length === this.#period) {
            this.#value = this.#sum / this.#period
        }
        return this.#value
    }

    reset () {
        this.#values = []
        this.#sum = 0
        this.#value = null
    }
}
