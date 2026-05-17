const Ema = require('../instruments/ema')
const EventName = require('../core/EventName')

class SimpleEMA {
    #events /** @type {EventEmitter} */
    #exchangeName /** @type {string} */
    #symbol /** @type {Symbol} */
    #name = 'simpleema' /** @type {string} */
    #eventName /** @type {string} */
    #ema /** @type {Ema|null} */

    /** @param {EventEmitter} events */
    /** @param {string} exchangeName */
    /** @param {Symbol} symbol */
    /** @param {number} period */
    constructor (events, exchangeName, symbol, period) {
        this.#events = events
        this.#exchangeName = exchangeName
        this.#symbol = symbol
        this.#ema = new Ema(period)
        this.#eventName = EventName.ofSignal(this.#name, this.#exchangeName, this.#symbol.id, this.#ema.period)
        this.#events.on(
            EventName.ofCandle(EventName.ACTION.CLOSED, this.#exchangeName, this.#symbol.id),
            (candle) => { this.#onCandleClosed(candle) }
        )
    }

    /**
     * Returns the name of the strategy
     * @returns {string}
     */
    get name () {
        return this.#name
    }

    /**
     * @param {Candle} candle
     */
    #onCandleClosed (candle) {
        const emaValue = this.#ema.push(candle.prices.close)
        if (emaValue != null) {
            console.log(candle.tsHr, emaValue)
        }
    }
}

module.exports = SimpleEMA
