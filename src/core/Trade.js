const Symbol = require('./Symbol')

/**
 * Represents a trade from an exchange.
 * @class
 */
class Trade {
    #exchangeName /** @type {string} */
    #symbol /** @type {Symbol} */
    #localId /** @type {string} */
    #remoteId /** @type {string} */
    #orderLocalId /** @type {string} */
    #tsUs /** @type {number} */
    #tsHr /** @type {string} */
    #price /** @type {number} */
    #baseQty /** @type {number} */
    #quoteQty /** @type {number} */
    #isBuyerMaker /** @type {boolean} */

    /**
     * Create a Trade instance.
     * @param {string} exchangeName - The exchange on which the trade occurred
     * @param {Symbol} symbol - Symbol object for the traded instrument
     * @param {string} localId - Local ID created and maintained by us
     * @param {string} remoteId - Remote ID from the exchange
     * @param {string} orderLocalId - The local ID of an order that created this trade
     * @param {number} tsUs - Timestamp of the trade in microseconds
     * @param {number} price - Price of the trade
     * @param {number} baseQty - Quantity in base currency
     * @param {number} quoteQty - Quantity in quote currency
     * @param {boolean} isBuyerMaker - Flag indicating whether the buyer was the maker
     */
    constructor (exchangeName, symbol, localId, remoteId, orderLocalId, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
        this.#exchangeName = exchangeName
        this.#symbol = symbol
        this.#localId = localId
        this.#remoteId = remoteId
        this.#orderLocalId = orderLocalId
        this.#tsUs = tsUs
        this.#tsHr = new Date(this.#tsUs / 1000).toISOString()
        this.#price = price
        this.#baseQty = baseQty
        this.#quoteQty = quoteQty
        this.#isBuyerMaker = isBuyerMaker
    }

    /**
     * The exchange on which the trade occurred
     * @returns {string}
     */
    get exchangeName () { return this.#exchangeName }

    /**
     * The symbol on which the trade occurred
     * @returns {Symbol}
     */
    get symbol () { return this.#symbol }

    /**
     * Local ID created and maintained by us
     * @returns {string}
     */
    get localId () { return this.#localId }

    /**
     * Remote ID, as this trade was received from remote exchange
     * @returns {string}
     */
    get remoteId () { return this.#remoteId }

    /**
     * The local ID of an order that created this Trade
     * @returns {string}
     */
    get orderLocalId () { return this.#orderLocalId }

    /**
     * Timestamp of the trade in microseconds
     * @returns {number}
     */
    get tsUs () { return this.#tsUs }

    /**
     * Timestamp of the trade as human readable string (ISO)
     * @returns {string}
     */
    get tsHr () { return this.#tsHr }

    /**
     * The price of the trade
     * @returns {number}
     */
    get price () { return this.#price }

    /**
     * The base quantity
     * @returns {number}
     */
    get baseQty () { return this.#baseQty }

    /**
     * The quote quantity
     * @returns {number}
     */
    get quoteQty () { return this.#quoteQty }

    /**
     * Flag indicating who was maker and who was taker
     * @returns {boolean}
     */
    get isBuyerMaker () { return this.#isBuyerMaker }
}

module.exports = Trade
