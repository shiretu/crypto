const Ema = require('./Ema')
const MacdLine = require('./MacdLine')

class MacdSignal {
    constructor (shortPeriod, longPeriod, signalPeriod, evaluatorFnc) {
        this.evaluatorFnc = evaluatorFnc
        this.macdLine = new MacdLine(shortPeriod, longPeriod, evaluatorFnc)
        this.signalEma = new Ema(signalPeriod, v => v)
        this.value = null
    }

    get isReady () { return this.signalEma.isReady }

    push (obj, evaluatorFnc = null) {
        const macd = this.macdLine.push(obj, evaluatorFnc)
        if (macd == null) { return null }
        const signal = this.signalEma.push(macd)
        if (signal == null) { return null }
        this.value = { macd, signal, histogram: macd - signal }
        return this.value
    }

    pretend (obj, evaluatorFnc = null) {
        const macd = this.macdLine.pretend(obj, evaluatorFnc)
        if (macd == null) return null
        const signal = this.signalEma.pretend(macd)
        if (signal == null) return null
        return { macd, signal, histogram: macd - signal }
    }
}

module.exports = MacdSignal
