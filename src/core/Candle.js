/* eslint-disable no-unused-vars */
const Trade = require('./Trade')
const Symbol = require('./Symbol')
const { EventEmitter } = require('events')
/* eslint-enable no-unused-vars */

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
     * Array of trades for the candle
     * @returns {Trade[]}
     */
    get trades () { return this.#trades }

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
     * Timestamp of the candle as human readable string (ISO)
     * @returns {string}
     */
    get tsHr () {
        const date = new Date(this.periodUs * this.#id / 1000)
        return date.toISOString()
    }

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
     * Number of trades in the candle
     * @returns {number}
     */
    get tradeCount () { return this.#trades.length }

    /**
     * Adds a new trade to the candle
     * @param {Trade} trade
     */
    update (trade) {
        if (trade.symbol.id !== this.#symbol.id) {
            throw new Error(`Trade symbol ${trade.symbol.id} does not match candle symbol ${this.#symbol.id}`)
        }
        if (trade.tsUs < this.#close.tsUs) {
            throw new Error(`Trade timestamp ${trade.tsUs} is earlier than last trade timestamp ${this.#close.tsUs}`)
        }
        this.#trades.push(trade)
        this.#close = trade
        const price = trade.price
        this.#high = (price > this.#high.price) ? trade : this.#high
        this.#low = (price < this.#low.price) ? trade : this.#low
        this.#volumes.quote += trade.quoteQty
        this.#volumes.base += trade.baseQty
    }

    /**
    * Static method to normalize an array of candles. For each candle, this computes normalized values for:
    *   - prices: open, close, high, low
    *   - height
    *   - volumes: quote, base
    *   - tradeCount
    *
    * All these values are rebased to the minimum value, then scaled by the maximum: (value - min) / max.
    * This means the smallest value becomes 0, and the largest (or max distance from min) becomes 1.
    *
    * Timestamps are also normalized to represent the candle's minute position within a day, ranging from -1440 to +1440 (minutes in a day).
    * Negative values indicate minutes from the previous day, positive values indicate today. Note: -1 is equivalent to 1439, so handle with care.
    * Negative values only occur if the candle set spans multiple days.
    *
    * @param {Array<Candle>} candles - Array of Candle instances to normalize
    */
    static normalize (candles) {
        if (candles.length === 0) return

        const ranges = {
            price: { min: Infinity, max: -Infinity, range: 0 },
            height: { min: Infinity, max: -Infinity, range: 0 },
            volumeQuote: { min: Infinity, max: -Infinity, range: 0 },
            volumeBase: { min: Infinity, max: -Infinity, range: 0 },
            tradeCount: { min: Infinity, max: -Infinity, range: 0 }
        }

        candles.forEach(candle => {
            ranges.price.min = Math.min(ranges.price.min, candle.prices.low)
            ranges.price.max = Math.max(ranges.price.max, candle.prices.high)
            ranges.price.range = ranges.price.max - ranges.price.min
            const height = candle.height
            ranges.height.min = Math.min(ranges.height.min, height)
            ranges.height.max = Math.max(ranges.height.max, height)
            ranges.height.range = ranges.height.max - ranges.height.min
            ranges.volumeQuote.min = Math.min(ranges.volumeQuote.min, candle.volumes.quote)
            ranges.volumeQuote.max = Math.max(ranges.volumeQuote.max, candle.volumes.quote)
            ranges.volumeQuote.range = ranges.volumeQuote.max - ranges.volumeQuote.min
            ranges.volumeBase.min = Math.min(ranges.volumeBase.min, candle.volumes.base)
            ranges.volumeBase.max = Math.max(ranges.volumeBase.max, candle.volumes.base)
            ranges.volumeBase.range = ranges.volumeBase.max - ranges.volumeBase.min
            ranges.tradeCount.min = Math.min(ranges.tradeCount.min, candle.tradeCount)
            ranges.tradeCount.max = Math.max(ranges.tradeCount.max, candle.tradeCount)
            ranges.tradeCount.range = ranges.tradeCount.max - ranges.tradeCount.min
        })

        const dayDurationUs = 24 * 60 * 60 * 1000 * 1000
        const referenceMidnightMin = (Math.floor(candles.at(-1).tsUs.open / dayDurationUs) * dayDurationUs) / (60 * 1000000)

        candles.forEach(candle => {
            candle.trades.forEach(trade => {
                trade.normalizedPrice = (trade.price - ranges.price.min) / ranges.price.range
            })
            candle.normalizedQuoteVolume = (candle.volumes.quote - ranges.volumeQuote.min) / ranges.volumeQuote.range
            candle.normalizedBaseVolume = (candle.volumes.base - ranges.volumeBase.min) / ranges.volumeBase.range
            candle.normalizedHeight = (candle.height - ranges.height.min) / ranges.height.range
            candle.normalizedTradesCount = (candle.tradeCount - ranges.tradeCount.min) / ranges.tradeCount.range
            candle.normalizedMinuteOfDay = Math.floor(candle.tsUs.open / (60 * 1000000)) - referenceMidnightMin
        })
    }
}

module.exports = Candle
