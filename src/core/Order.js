class Order {
    static Buy = 'buy'
    static Sell = 'sell'

    constructor (type, symbol, price, quoteQty) {
        this._type = type
        this._symbol = symbol
        this._price = price
        this._quoteQty = quoteQty
    }

    static create (type, symbol, price, quoteQty) { return new Order(type, symbol, price, quoteQty) }
    static createBuy (symbol, price, quoteQty) { return Order.create('buy', symbol, price, quoteQty) }
    static createSell (symbol, price, quoteQty) { return Order.create('sell', symbol, price, quoteQty) }
}
module.exports = Order
