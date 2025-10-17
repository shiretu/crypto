class Exchange {
    constructor (exchange, symbol) {
        this._exchange = exchange
        this._symbol = symbol
    }

    get exchange () { return this._exchange }
    get symbol () { return this._symbol }
}

module.exports = Exchange
