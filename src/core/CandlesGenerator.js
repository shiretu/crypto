const { EventEmitter } = require('events')
const Candle = require('./Candle')
const Symbol = require('./Symbol')

/**
 * Generates candle objects from a stream of trades.
 * Listens to an EventEmitter for 'trade' events and emits candle lifecycle events
 * (for example 'candleOpen').
 * @class
 */
class CandlesGenerator {
    #events /** @type {EventEmitter} */
    #symbol /** @type {Symbol} */
    #exchangeName /** @type {string} */
    #candleDurationUs /** @type {number} */
    #candle /** @type {Candle} */

    /**
     * Create a CandlesGenerator.
     * @param {EventEmitter} events - Event emitter to listen for trades on
     * @param {Symbol} symbol - Symbol instance this generator produces candles for
     * @param {string} exchangeName - Exchange identifier to filter incoming trades
     * @param {number} candleDurationMin - Candle duration in minutes
     */
    constructor (events, symbol, exchangeName, candleDurationMin) {
        this.#events = events
        this.#symbol = symbol
        this.#exchangeName = exchangeName
        this.#candleDurationUs = candleDurationMin * 60000000
        this.#candle = /** @type {Candle} */ (null)
        this.#events.on('trade', (trade) => { this.#onTrade(trade) })
    }

    #onTrade (trade) {
        if ((trade.exchangeName !== this.#exchangeName) || (trade.symbol.id !== this.#symbol.id)) { return }
        const candleId = Math.floor(trade.tsUs / this.#candleDurationUs)
        if (!this.#candle) {
            this.#candle = new Candle(this.#exchangeName, this.#symbol, candleId, this.#candleDurationUs, trade)
            this.#events.emit('candleOpened', this.#candle)
            return
        }

        if (this.#candle.id !== candleId) {
            this.#events.emit('candleClosed', this.#candle)
            this.#candle = new Candle(this.#exchangeName, this.#symbol, candleId, this.#candleDurationUs, trade)
            this.#events.emit('candleOpened', this.#candle)
            return
        }

        this.#candle.update(trade)
        this.#events.emit('candleUpdated', this.#candle)
    }
}

module.exports = CandlesGenerator
