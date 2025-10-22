/**
 * Exponential Moving Average (EMA) indicator
 */
class Ema {
    #period /** @type {number} */
    #alpha /** @type {number} */
    #value /** @type {number|null} */
    #firstSum /** @type {number} */
    #firstElementsCount /** @type {number} */
    #activeFunction /** @type {function} */

    /**
     * @param {number} period
     */
    constructor (period) {
        this.#period = period
        this.#alpha = 2 / (this.#period + 1)
        this.#value = null
        this.#firstSum = 0
        this.#firstElementsCount = 0
        this.#activeFunction = (value) => this.#computeInitial(value)
    }

    /**
     * Returns the capacity of the EMA
     * @returns {number}
     */
    get period () { return this.#period }

    /**
     * Returns the current EMA value
     * @returns {number|null}
     */
    get value () { return this.#value }

    /**
     * Indicates whether the EMA is ready
     * @returns {boolean}
     */
    get isReady () { return this.#value != null }

    /**
     * Pushes a new value to the EMA calculation
     * @param {number} value
     * @returns {number|null} The updated EMA value or null if not enough data
     */
    push (value) { return (this.#value = this.#activeFunction(value)) }

    /**
     * Simulates pushing a new value without updating the EMA state
     * @param {number} value
     * @returns {number|null} The simulated EMA value or null if not enough data
     */
    simulate (value) {
        if (!this.isReady) return null
        return this.#computeNormal(value)
    }

    /**
     * Computes the initial EMA value
     * @param {number} value
     * @returns {number|null} The initial EMA value or null if not enough data
     */
    #computeInitial (value) {
        if (this.#firstElementsCount < this.#period) {
            this.#firstSum += value
            this.#firstElementsCount++
            if (this.#firstElementsCount === this.#period) {
                this.#value = this.#firstSum / this.#firstElementsCount
                this.#activeFunction = (value) => this.#computeNormal(value)
                return this.#value
            }
            return null
        }
        return null
    }

    /**
     * Computes the normal EMA value
     * @param {number} value
     * @returns {number|null} The normal EMA value or null if not enough data
     */
    #computeNormal (value) {
        return (value * this.#alpha) + (this.#value * (1 - this.#alpha))
    }
}

module.exports = Ema
