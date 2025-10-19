const Trade = require('./Trade')
const Symbol = require('./Symbol')
const { EventEmitter } = require('events')

/**
 * Represents an aggregated candle (OHLC + volume) for a time bucket.
 */
class Candle {
    #exchangeName /** @type {string} */
    #symbol /** @type {Symbol} */
    #id /** @type {number} */
    #periodUs /** @type {number} */
    #trades /** @type {Trade[]} */
    #open /** @type {Trade} */
    #close /** @type {Trade} */
    #high /** @type {Trade} */
    #low /** @type {Trade} */
    #volumes /** @type {{quote:number,base:number}} */

    /**
     * Create a Candle instance.
     * @param {string} exchangeName - Exchange identifier this candle belongs to
     * @param {Symbol} symbol - Symbol instance this candle belongs to
     * @param {number} id - Identifier for the candle (time bucket id). Must be a finite integer.
     * @param {number} periodUs - The period in micros for this candle
     * @param {Trade} trade - The first trade associated with this candle
     */
    constructor (exchangeName, symbol, id, periodUs, trade) {
        this.#exchangeName = exchangeName
        this.#symbol = symbol
        this.#id = id
        this.#periodUs = periodUs
        this.#trades = [trade]
        this.#open = trade
        this.#close = trade
        this.#high = trade
        this.#low = trade
        this.#volumes = { quote: trade.quoteQty, base: trade.baseQty }
    }

    /**
     * Exchange identifier this candle belongs to
     * @returns {string}
     */
    get exchangeName () { return this.#exchangeName }

    /**
     * Symbol instance this candle belongs to
     * @returns {Symbol}
     */
    get symbol () { return this.#symbol }

    /**
     * Identifier for this candle (as provided by the generator)
     * @returns {number}
     */
    get id () { return this.#id }

    /**
     * The period in micros for this candle
     * @returns {number}
     */
    get periodUs () { return this.#periodUs }

    /**
     * Open trade for the candle
     * @returns {Trade}
     */
    get open () { return this.#open }

    /**
     * Close trade for the candle
     * @returns {Trade}
     */
    get close () { return this.#close }

    /**
     * High trade for the candle
     * @returns {Trade}
     */
    get high () { return this.#high }

    /**
     * Low trade for the candle
     * @returns {Trade}
     */
    get low () { return this.#low }

    /**
     * OHLC prices for the candle (from trades)
     * @returns {{open:number,close:number,high:number,low:number}}
     */
    get prices () {
        return {
            open: this.#open.price,
            close: this.#close.price,
            high: this.#high.price,
            low: this.#low.price
        }
    }

    /**
     * Timestamps (in microseconds) for the candle trades
     * @returns {{open:number,close:number,high:number,low:number}}
     */
    get tsUs () {
        return {
            candle: this.periodUs * this.#id,
            open: this.#open.tsUs,
            close: this.#close.tsUs,
            high: this.#high.tsUs,
            low: this.#low.tsUs
        }
    }

    /**
     * Direction of the candle based on close vs open price.
     * @returns {1|0|-1} 1 when close&gt;open, 0 when equal, -1 otherwise
     */
    get direction () {
        const o = this.#open.price
        const c = this.#close.price
        return (c > o) ? 1 : (c === o ? 0 : -1)
    }

    /**
     * Sum of volumes for all trades in the candle.
     * @returns {{quote:number,base:number}}
     */
    get volumes () { return this.#volumes }

    /**
     * Absolute price difference between open and close (quote per base)
     * @returns {number}
     */
    get height () { return Math.abs(this.#close.price - this.#open.price) }

    /**
     * Adds a new trade to the candle
     * @param {Trade} trade
     */
    update (trade) {
        this.#trades.push(trade)
        this.#close = trade
        const price = trade.price
        this.#high = (price > this.#high.price) ? trade : this.#high
        this.#low = (price < this.#low.price) ? trade : this.#low
        this.#volumes.quote += trade.quoteQty
        this.#volumes.base += trade.baseQty
    }
}

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
        this.#candle = null
        this.#events.on('trade', (trade) => { this.#onTrade(trade) })
    }

    /**
     * Handle an incoming trade event. If the trade belongs to this generator's
     * exchange and symbol, update or open a candle as needed.
     * @param {Trade} trade - trade event object
     * @returns {void}
     */
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

module.exports = {
    Candle,
    CandlesGenerator
}
