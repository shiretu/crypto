class Order {
    static Buy = 'buy'
    static Sell = 'sell'

    static #IdGenerator = 1

    #_id
    #_type
    #_symbol
    #_entryQuoteQty
    #_entryPrice
    #_stopLossPrice
    #_takeProfitPrice

    constructor (type, symbol, entryQuoteQty, entryPrice, stopLossPrice, takeProfitPrice) {
        this.#_id = Order.#IdGenerator++
        this.#_type = type
        this.#_symbol = symbol
        this.#_entryQuoteQty = entryQuoteQty
        this.#_entryPrice = entryPrice
        this.#_stopLossPrice = stopLossPrice || (type === 'buy' ? entryPrice * 0.996 : entryPrice * 1.010)
        this.#_takeProfitPrice = takeProfitPrice || (type === 'buy' ? entryPrice * 1.004 : entryPrice * 0.990)
    }

    get id () { return this.#_id }
    get type () { return this.#_type }
    get symbol () { return this.#_symbol }
    get entryPrice () { return this.#_entryPrice }
    get stopLossPrice () { return this.#_stopLossPrice }
    get takeProfitPrice () { return this.#_takeProfitPrice }
    get entryQuoteQty () { return this.#_entryQuoteQty }
    get feePercent () { return 0.001 }

    static create (type, symbol, entryQuoteQty, entryPrice, stopLossPrice, takeProfitPrice) { return new Order(type, symbol, entryQuoteQty, entryPrice, stopLossPrice, takeProfitPrice) }
    static createBuy (symbol, entryQuoteQty, entryPrice, stopLossPrice, takeProfitPrice) { return Order.create('buy', symbol, entryQuoteQty, entryPrice, stopLossPrice, takeProfitPrice) }
    static createSell (symbol, entryQuoteQty, entryPrice, stopLossPrice, takeProfitPrice) { return Order.create('sell', symbol, entryQuoteQty, entryPrice, stopLossPrice, takeProfitPrice) }
}

module.exports = Order
