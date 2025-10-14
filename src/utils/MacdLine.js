const Ema = require('./Ema')

class MacdLine {
    constructor (shortPeriod, longPeriod, evaluatorFnc) {
        if (!(shortPeriod > 0 && longPeriod > 0) || (shortPeriod >= longPeriod)) {
            throw new Error('MacdLine: require 0 < shortPeriod < longPeriod')
        }
        this.evaluatorFnc = evaluatorFnc
        this.short = new Ema(shortPeriod, evaluatorFnc)
        this.long = new Ema(longPeriod, evaluatorFnc)
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

    push (obj, evaluatorFnc = null) {
        this.short.push(obj, evaluatorFnc)
        this.long.push(obj, evaluatorFnc)
        return this.activeFunction()
    }

    pretend (obj, evaluatorFnc = null) {
        const l = this.long.pretend(obj, evaluatorFnc)
        if (l == null) { return null }
        return this.short.pretend(obj, evaluatorFnc) - l
    }
}

module.exports = MacdLine
