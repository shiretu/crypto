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
     * Create a Candle instance from an array of trades.
     * @param {string} exchangeName - Exchange identifier this candle belongs to
     * @param {Symbol} symbol - Symbol instance this candle belongs to
     * @param {number} periodUs - The period in micros for this candle
     * @param {Trade[]} trades - Array of trades to create the candle from
     * @returns {Candle} - The created Candle instance
     */
    static createFromTrades (exchangeName, symbol, periodUs, trades) {
        if (trades.length === 0) {
            throw new Error('Cannot create Candle from empty trades array')
        }
        const candleId = Math.floor(trades[0].tsUs / periodUs)
        const candle = new Candle(exchangeName, symbol, candleId, periodUs, trades[0])
        for (let i = 1; i < trades.length; i++) {
            candle.update(trades[i])
        }
        return candle
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
    * Static method to normalize an array of candles.
    * For each candle this computes normalized values for:
    *   - prices: each trade gets normalizedPrice
    *   - volumes: normalizedQuoteVolume, normalizedBaseVolume
    *   - height: normalizedHeight
    *   - trade count: normalizedTradesCount
    *   - time: normalizedMinuteOfDay (minute index relative to reference midnight)
    *
    * Scaling modes:
    *   aroundZero=false (default): values are scaled to [0, factor] using (value - min)/(max-min) * factor.
    *   aroundZero=true: values are shifted to be centered on 0 by subtracting factor/2
    *       i.e. (value - min)/(max-min) * factor - factor/2, resulting in [-factor/2, +factor/2].
    *       When max === min the normalized value is 0 (degenerate range).
    *
    * factor (default 1) allows amplifying the output range (e.g. factor=2 doubles the span).
    *
    * Minute-of-day normalization: We pick midnight based on the last candle's day.
    *   normalizedMinuteOfDay = floor(openTsUs / 60e6) - referenceMidnightMinutes.
    * This preserves negative values for candles belonging to previous days and positive / zero for the reference day and forward.
    *
    * Edge cases: If a range is zero (all candles share the same value) the normalized value becomes 0.
    *
    * @param {Array<Candle>} candles - Array of Candle instances to normalize (in chronological order)
    * @param {boolean} [aroundZero=false] - When true produce symmetric range around 0 instead of starting at 0.
    * @param {number} [factor=1] - Multiplier for the output range span.
    */
    static normalize (candles, aroundZero, factor) {
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

        const normalizeValueWithZero = (value, min, range) => {
            if (range === 0) return 0
            return (value - min) * factor / range - factor / 2
        }
        const normalizeValueWithoutZero = (value, min, range) => {
            if (range === 0) return 0
            return (value - min) * factor / range
        }
        const normalizeValue = aroundZero ? normalizeValueWithZero : normalizeValueWithoutZero

        candles.forEach(candle => {
            candle.trades.forEach(trade => {
                trade.normalizedPrice = normalizeValue(trade.price, ranges.price.min, ranges.price.range)
            })
            candle.normalizedQuoteVolume = normalizeValue(candle.volumes.quote, ranges.volumeQuote.min, ranges.volumeQuote.range)
            candle.normalizedBaseVolume = normalizeValue(candle.volumes.base, ranges.volumeBase.min, ranges.volumeBase.range)
            candle.normalizedHeight = normalizeValue(candle.height, ranges.height.min, ranges.height.range)
            candle.normalizedTradesCount = normalizeValue(candle.tradeCount, ranges.tradeCount.min, ranges.tradeCount.range)
            candle.normalizedMinuteOfDay = Math.floor(candle.tsUs.open / (60 * 1000000)) - referenceMidnightMin
        })
    }
}

module.exports = Candle
