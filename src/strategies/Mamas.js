const console = require('../utils/coloredConsole')

const Ema = require('../instruments/Ema')
const MacdSignal = require('../instruments/MacdSignal')

class Mamas {
    static #SETUP = {
        macd: {
            short: 12,
            long: 26,
            signal: 9
        },
        volume: 20
    }

    constructor (events) {
        const priceEvaluator = (candle) => candle.close.price
        const volumeEvaluator = (candle) => candle.info.quoteVolume
        this.events = events
        this.current = {
            emaVolume: new Ema(Mamas.#SETUP.volume, volumeEvaluator),
            macdSignal: new MacdSignal(Mamas.#SETUP.macd.short, Mamas.#SETUP.macd.long, Mamas.#SETUP.macd.signal, priceEvaluator)
        }
        this.previous = {
            emaVolume: 0,
            macdSignal: null
        }
        this.enabled = true
        this.events.on('candleUpdate', (evt) => this.#onCandleUpdate(evt))
        this.events.on('candleClose', (evt) => this.#onCandleClose(evt))
        this.events.on('orderClosed', (evt) => { this.enabled = true })
    }

    #onCandleUpdate (evt) {
        // console.log(evt.candle.tsHr)
    }

    #onCandleClose (evt) {
        this.current.emaVolume.push(evt.candle)
        this.current.macdSignal.push(evt.candle)
        try {
            if (!(this.current.emaVolume.isReady &&
                this.current.macdSignal.isReady &&
                (this.previous.macdSignal !== null) &&
                (this.previous.emaVolume !== null)
            )) return

            console.log(evt.candle.symbol, evt.candle.tsHr, JSON.stringify(this.current.macdSignal.value))
        } finally {
            this.previous.emaVolume = this.current.emaVolume.value
            this.previous.macdSignal = this.current.macdSignal.value
        }
    }
}

module.exports = Mamas
