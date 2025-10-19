class HighsAndLows {
    constructor () {
        this.high = null
        this.low = null
        this.currentValue = null
    }

    get value () { return this.currentValue }
    get isReady () { return this.currentValue != null }

    push (value) {
        if (this.high === null) {
            this.high = value
            this.low = value
            return null
        }
        if ((this.low <= value) && (value <= this.high)) { return null }
        const newHigh = value > this.high
        if (newHigh) {
            this.high = value
        } else {
            this.low = value
        }
        this.currentValue = { high: this.high, low: this.low, newHigh }
        return this.currentValue
    }
}

module.exports = HighsAndLows
