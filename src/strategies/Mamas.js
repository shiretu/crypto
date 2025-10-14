const Ma = require('../utils/Ma')
const console = require('../utils/coloredConsole')

class Mamas {
    static #SETUP = {
        window: {
            price: {
                short: 5,
                long: 30
            },
            volume: 20
        }
    }

    constructor (events) {
        const maPriceEvaluator = (candle) => candle.close.price
        const maVolumeEvaluator = (candle) => candle.info.quoteVolume
        this.events = events
        this.current = {
            maPriceShort: new Ma(Mamas.#SETUP.window.price.short, maPriceEvaluator),
            maPriceLong: new Ma(Mamas.#SETUP.window.price.long, maPriceEvaluator),
            maVolume: new Ma(Mamas.#SETUP.window.volume, maVolumeEvaluator)
        }
        this.previous = {
            maPriceShort: 0,
            maPriceLong: 0,
            maVolume: 0
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
        this.current.maPriceShort.push(evt.candle)
        this.current.maPriceLong.push(evt.candle)
        this.current.maVolume.push(evt.candle)
        try {
            if (!(this.current.maPriceShort.isReady &&
                this.current.maPriceLong.isReady &&
                this.current.maVolume.isReady &&
                (this.previous.maPriceShort !== 0) &&
                (this.previous.maPriceLong !== 0) &&
                (this.previous.maVolume !== 0)
            )) return

            console.log(evt.candle.tsHr, this.current.maPriceShort.value)
        } finally {
            this.previous.maPriceShort = this.current.maPriceShort.value
            this.previous.maPriceLong = this.current.maPriceLong.value
            this.previous.maVolume = this.current.maVolume.value
        }
    }
}

module.exports = Mamas
