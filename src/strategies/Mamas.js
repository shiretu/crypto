const Ma = require('../utils/Ma')
const console = require('../utils/coloredConsole')

class Mamas {
    static #SETUP = {
        shortMaWindow: 5,
        longMaWindow: 30
    }

    constructor (events) {
        const maEvaluator = (candle) => candle.close.price
        this.events = events
        this.maShort = new Ma(Mamas.#SETUP.shortMaWindow, maEvaluator)
        this.maLong = new Ma(Mamas.#SETUP.longMaWindow, maEvaluator)
        this.enabled = true
        this.events.on('candleUpdate', (evt) => this.#onCandleUpdate(evt))
        this.events.on('candleClose', (evt) => this.#onCandleClose(evt))
        this.events.on('orderClosed', (evt) => { this.enabled = true })
    }

    #onCandleUpdate (evt) {
        // console.log(evt.candle.tsHr)
    }

    #onCandleClose (evt) {
        this.maShort.push(evt.candle)
        this.maLong.push(evt.candle)
        console.color(this.maShort.value > this.maLong.value ? console.GREEN : console.RED, `${evt.tick.symbol}: ${evt.candle.tsHr} - ${evt.candle.close.price.toFixed(8)} - [${this.maShort.value.toFixed(8)} - ${this.maLong.value.toFixed(8)}] - ${evt.tick.price.toFixed(8)} - ${this.maShort.value > this.maLong.value ? '' : '*'}`)
    }
}

module.exports = Mamas
