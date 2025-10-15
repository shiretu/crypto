const Ema = require('./Ema')
const MacdLine = require('./MacdLine')

class MacdSignal {
    constructor (shortPeriod, longPeriod, signalPeriod) {
        this.macdLine = new MacdLine(shortPeriod, longPeriod)
        this.signalEma = new Ema(signalPeriod)
        this.value = null
    }

    get isReady () { return this.signalEma.isReady }

    push (value) {
        const macd = this.macdLine.push(value)
        if (macd == null) { return null }
        const signal = this.signalEma.push(macd)
        if (signal == null) { return null }
        this.value = { macd, signal, histogram: macd - signal }
        return this.value
    }

    pretend (value) {
        const macd = this.macdLine.pretend(value)
        if (macd == null) return null
        const signal = this.signalEma.pretend(macd)
        if (signal == null) return null
        return { macd, signal, histogram: macd - signal }
    }
}

module.exports = MacdSignal
