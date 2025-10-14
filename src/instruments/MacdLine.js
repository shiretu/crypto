const Ema = require('./Ema')

class MacdLine {
    constructor (shortPeriod, longPeriod) {
        if (!(shortPeriod > 0 && longPeriod > 0) || (shortPeriod >= longPeriod)) {
            throw new Error('MacdLine: require 0 < shortPeriod < longPeriod')
        }
        this.short = new Ema(shortPeriod)
        this.long = new Ema(longPeriod)
        this.currentValue = null
        this.activeFunction = () => {
            if (!(this.short.isReady && this.long.isReady)) { return null }
            this.activeFunction = () => {
                this.currentValue = this.short.value - this.long.value
                return this.currentValue
            }
            return this.activeFunction()
        }
    }

    get value () { return this.currentValue }
    get isReady () { return this.currentValue != null }

    push (value) {
        this.short.push(value)
        this.long.push(value)
        return this.activeFunction()
    }

    pretend (value) {
        const l = this.long.pretend(value)
        if (l == null) { return null }
        return this.short.pretend(value) - l
    }
}

module.exports = MacdLine
