class Trade {
    #symbol
    #localId
    #remoteId
    #orderLocalId
    #tsUs
    #tsHr
    #price
    #baseQty
    #quoteQty
    #isBuyerMaker
    constructor (symbol, localId, remoteId, orderLocalId, tsUs, price, baseQty, quoteQty, isBuyerMaker) {
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
     * The symbol on which the trade occurred
     */

    get symbol () { return this.#symbol }

    /**
     * Local ID created and maintained by us
     */
    get localId () { return this.#localId }

    /**
     * Remote ID, as this trade was received from remote exchange
     */
    get remoteId () { return this.#remoteId }

    /**
     * The local ID of an order that created this Trade
     */
    get orderLocalId () { return this.#orderLocalId }

    /**
     * Timestamp of the trade in microseconds
     */
    get tsUs () { return this.#tsUs }

    /**
     * Timestamp of the trade as human readable string
     */
    get tsHr () { return this.#tsHr }

    /**
     * The price of the trade
     */
    get price () { return this.#price }

    /**
     * The base quantity
     */
    get baseQty () { return this.#baseQty }

    /**
     * The quote quantity
     */
    get quoteQty () { return this.#quoteQty }

    /**
     * Flag indicating who was maker and who was taker
     */
    get isBuyerMaker () { return this.#isBuyerMaker }
}

module.exports = Trade
