const { EventEmitter } = require('events')
const Candle = require('./Candle')
const Symbol = require('./Symbol')
const EventName = require('./EventName')

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
    #candleOpenedEvent /** @type {string} */
    #candleUpdatedEvent /** @type {string} */
    #candleClosedEvent /** @type {string} */

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
        this.#events.on(EventName.ofTrade(EventName.ACTION.EXECUTED, exchangeName, symbol.id), (trade) => { this.#onTrade(trade) })
        this.#candleOpenedEvent = EventName.ofCandle(EventName.ACTION.OPENED, exchangeName, symbol.id)
        this.#candleUpdatedEvent = EventName.ofCandle(EventName.ACTION.UPDATED, exchangeName, symbol.id)
        this.#candleClosedEvent = EventName.ofCandle(EventName.ACTION.CLOSED, exchangeName, symbol.id)
    }

    #onTrade (trade) {
        const candleId = Math.floor(trade.tsUs / this.#candleDurationUs)
        if (!this.#candle) {
            this.#candle = new Candle(this.#exchangeName, this.#symbol, candleId, this.#candleDurationUs, trade)
            this.#events.emit(this.#candleOpenedEvent, this.#candle)
            return
        }

        if (this.#candle.id !== candleId) {
            this.#events.emit(this.#candleClosedEvent, this.#candle)
            this.#candle = new Candle(this.#exchangeName, this.#symbol, candleId, this.#candleDurationUs, trade)
            this.#events.emit(this.#candleOpenedEvent, this.#candle)
            return
        }

        this.#candle.update(trade)
        this.#events.emit(this.#candleUpdatedEvent, this.#candle)
    }
}

module.exports = CandlesGenerator
