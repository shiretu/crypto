const EventName = require('../core/EventName')
const Symbol = require('../core/Symbol')
const Candle = require('../core/Candle')

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
        this.#candles.push(candle)
        if (this.#candles.length < 3) {
            return
        } else {
            if (this.#candles.length > 3) {
                this.#candles.shift()
            }
        }
        const c1 = this.#candles[0]
        const c2 = this.#candles[1]
        const c3 = this.#candles[2]

        // check for fair value gap
        if (c1.direction === 0 || c2.direction === 0 || c3.direction === 0) { return }
        if (c1.direction === c2.direction) { return }
        if (c2.direction === c3.direction) { return }
        if (c1.direction !== c3.direction) { return }
        if (c1.direction > 0) {
            // bullish fvg
            if (c1.prices.low > c3.prices.high) {
                this.#events.emit(this.#eventName, this.#candles)
            }
        } else {
            // bearish fvg
            if (c1.prices.high < c3.prices.low) {
                this.#events.emit(this.#eventName, this.#candles)
            }
        }
    }
}
module.exports = {
    create: async (events, exchangeName, symbol) => {
        return new FVG(events, exchangeName, symbol)
    }
}
