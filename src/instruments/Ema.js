class Ema {
    constructor (capacity) {
        this.capacity = capacity
        this.alpha = 2 / (this.capacity + 1)
        this.currentValue = null
        this.firstSum = 0
        this.firstElementsCount = 0
        this.activeFunction = (value) => this.#computeInitial(value)
    }

    get value () { return this.currentValue }
    get isReady () { return this.currentValue != null }

    push (value) { return (this.currentValue = this.activeFunction(value)) }

    pretend (value) {
        if (!this.isReady) return null
        return this.#computeNormal(value)
    }

    #computeInitial (value) {
        if (this.firstElementsCount < this.capacity) {
            this.firstSum += value
            this.firstElementsCount++
            if (this.firstElementsCount === this.capacity) {
                this.currentValue = this.firstSum / this.firstElementsCount
                this.activeFunction = (value) => this.#computeNormal(value)
                return this.currentValue
            }
            return null
        }
        return null
    }

    #computeNormal (value) { return (value * this.alpha) + (this.currentValue * (1 - this.alpha)) }
}

module.exports = Ema
