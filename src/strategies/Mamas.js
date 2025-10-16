const console = require('../utils/coloredConsole')

const Ema = require('../instruments/Ema')
const MacdImpulse = require('../instruments/MacdImpulse')

class Mamas {
    static #SETUP = {
        macd: MacdImpulse.DefaultsConfig,
        volume: 20
    }

    constructor (events) {
        this.events = events
        this.current = {
            emaVolume: new Ema(Mamas.#SETUP.volume),
            macdImpulse: MacdImpulse.create(Mamas.#SETUP.macd)
        }
        this.previous = {
            emaVolume: 0,
            macdImpulse: null
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
        this.current.emaVolume.push(evt.candle.info.volume)
        this.current.macdImpulse.push(evt.candle.close.price)
        try {
            if (!(this.current.emaVolume.isReady &&
                this.current.macdImpulse.isReady &&
                (this.previous.macdImpulse !== null) &&
                (this.previous.emaVolume !== null)
            )) return

            console.log(evt.candle.symbolName, evt.candle.tsHr, JSON.stringify(this.current.macdImpulse.value))
        } finally {
            this.previous.emaVolume = this.current.emaVolume.value
            this.previous.macdImpulse = this.current.macdImpulse.value
        }
    }
}

module.exports = Mamas
