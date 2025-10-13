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

            const crossedUp = (this.previous.maPriceShort < this.previous.maPriceLong) &&
            (this.current.maPriceShort.value > this.current.maPriceLong.value)

            const priceAbove = evt.candle.close.price > this.current.maPriceLong.value
            const volConfirm = evt.candle.info.quoteVolume >= 1.2 * this.current.maVolume.value
            const green = evt.candle.direction > 0
            const slope = this.current.maPriceLong.value - this.previous.maPriceLong
            const trendUp = slope > 0

            if (!crossedUp) return

            const potentialBuy = priceAbove && volConfirm && green && trendUp
            console.color(potentialBuy ? console.GREEN : console.RED, evt.candle.symbol, evt.candle.tsHr, JSON.stringify({
                priceAbove,
                volConfirm,
                green,
                trendUp,
                potentialBuy,
                ma30: this.current.maPriceLong.value.toFixed(8),
                ma5: this.current.maPriceShort.value.toFixed(8),
                candleClose: evt.candle.close.price.toFixed(8)
            }))
        } finally {
            this.previous.maPriceShort = this.current.maPriceShort.value
            this.previous.maPriceLong = this.current.maPriceLong.value
            this.previous.maVolume = this.current.maVolume.value
        }
    }
}

module.exports = Mamas
