/* eslint-disable no-unused-vars */
const EventName = require('../core/EventName')
const Symbol = require('../core/Symbol')
const Candle = require('../core/Candle')
/* eslint-enable no-unused-vars */

class FVG {
    #events /** @type {EventEmitter} */
    #exchangeName /** @type {string} */
    #symbol /** @type {Symbol} */
    #name = 'fvg' /** @type {string} */
    #eventName /** @type {string} */
    #candles /** @type {Candle[]} */

    /** @param {EventEmitter} events */
    /** @param {string} exchangeName */
    /** @param {Symbol} symbol */
    constructor (events, exchangeName, symbol) {
        this.#events = events
        this.#exchangeName = exchangeName
        this.#symbol = symbol
        this.#eventName = EventName.ofSignal(this.#name, this.#exchangeName, this.#symbol.id)
        this.#events.on(
            EventName.ofCandle(EventName.ACTION.CLOSED, this.#exchangeName, this.#symbol.id),
            (candle) => { this.#onCandleClosed(candle) }
        )
        this.#candles = /** @type {Candle[]} */ ([])
    }

    /**
     * Returns the name of the strategy
     * @returns {string}
     */
    get name () {
        return this.#name
    }

    #onCandleClosed (candle) {
        // add the closed candle to the list
        this.#candles.push(candle)

        // too few candles to form a fair value gap
        if (this.#candles.length < 3) return

        // keep only the last 3 candles
        if (this.#candles.length > 3) this.#candles.shift()

        // not all candles are in the same direction
        if (Math.abs(this.#candles.reduce((totalDirection, candle) => { return totalDirection + candle.direction }, 0)) !== 3) return

        // check for fair value gap
        if (this.#candles[0].direction > 0) {
            // no fair value gap
            if (this.#candles[0].prices.high >= this.#candles[2].prices.low) return
        } else {
            // no fair value gap
            if (this.#candles[0].prices.low <= this.#candles[2].prices.high) return
        }

        // alright, we have a fair value gap, emit the signal
        this.#events.emit(this.#eventName, this.#candles)
    }
}
module.exports = FVG
