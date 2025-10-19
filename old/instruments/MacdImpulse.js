const Ema = require('./Ema')
const MacdSignal = require('./MacdSignal')

class MacdImpulse {
    static DefaultsConfig = {
        shortPeriod: 12,
        longPeriod: 26,
        signalPeriod: 9,
        trendPeriod: 13,
        slopeEpsilon: 0,
        slopeSource: 'macd'
    }

    constructor (shortPeriod, longPeriod, signalPeriod, trendPeriod, slopeEpsilon, slopeSource) {
        this.slopeEpsilon = Math.abs(slopeEpsilon)
        this.slopeSource = slopeSource
        this.macdSignal = new MacdSignal(shortPeriod, longPeriod, signalPeriod)
        this.trendEma = new Ema(trendPeriod)
        this.value = null
        this.last = null
    }

    static create (config) {
        return new MacdImpulse(config.shortPeriod, config.longPeriod, config.signalPeriod, config.trendPeriod, config.slopeEpsilon, config.slopeSource)
    }

    get isReady () { return this.macdSignal.isReady && this.trendEma.isReady }

    push (value) {
        const macd = this.macdSignal.push(value)
        const trend = this.trendEma.push(value)
        if ((macd == null) || (trend == null)) return null

        try {
            if (this.last == null) return null
            this.value = { ...macd, trend, impulse: this.#computeImpulse(macd[this.slopeSource], trend) }
            return this.value
        } finally {
            this.last = { macd, trend }
        }
    }

    pretend (value) {
        const macd = this.macdSignal.pretend(value)
        const trend = this.trendEma.pretend(value)
        if ((macd == null) || (trend == null) || (this.last == null)) return null
        return { ...macd, trend, impulse: this.#computeImpulse(macd[this.slopeSource], trend) }
    }

    #computeImpulse (macdValue, trendValue) {
        const macdDelta = macdValue - this.last.macd[this.slopeSource]
        const trendDelta = trendValue - this.last.trend

        const macdUp = macdDelta > this.slopeEpsilon
        const macdDown = macdDelta < -this.slopeEpsilon
        const trendUp = trendDelta > this.slopeEpsilon
        const trendDown = trendDelta < -this.slopeEpsilon

        return (macdUp && trendUp) ? 'green' : ((macdDown && trendDown) ? 'red' : 'blue')
    }
}

module.exports = MacdImpulse
