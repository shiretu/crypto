const Order = require('./Order')

class WalletSlot {
    constructor (symbol) {
        this.actions = {
            open: {
                buy: (...args) => this.openBuy(...args),
                sell: (...args) => this.openSell(...args)
            },
            close: {
                buy: (...args) => this.closeBuy(...args),
                sell: (...args) => this.closeSell(...args)
            }
        }
        this._symbol = symbol
        this._orders = new Map()
        this._baseQty = 0
        this._quoteQty = 0
    }

    openOrder (/** @type {Order} */ order) {
        if (this._orders.has(order.id)) throw new Error('Order already opened')
        this.actions.open[order.type](order)
    }

    tick (tick, events) {
        this._orders.entries().forEach(([id, trade]) => this.actions.close[trade.order.type](tick, trade, events))
    }

    openSell (/** @type {Order} */ order) {
        // here we say we wanna transact with the base asset worth of quote asset, because is easier to think in quote asset
        // so, we need to compute the base asset we will sell
        const baseQty = order.entryQuoteQty / order.entryPrice
        const trade = {
            order,
            open: {
                quoteQty: order.entryQuoteQty,
                feeQuoteQty: order.entryQuoteQty * order.feePercent
            }
        }
        this._baseQty -= baseQty
        this._quoteQty += trade.order.entryQuoteQty
        this._quoteQty -= trade.open.feeQuoteQty
        this._orders.set(order.id, trade)
    }

    openBuy (/** @type {Order} */ order) {
        const trade = {
            order,
            open: {
                baseQty: order.entryQuoteQty / order.entryPrice,
                feeQuoteQty: order.entryQuoteQty * order.feePercent
            }
        }
        this._baseQty += trade.open.baseQty
        this._quoteQty -= trade.order.entryQuoteQty
        this._quoteQty -= trade.open.feeQuoteQty
        this._orders.set(order.id, trade)
    }

    closeSell (tick, trade, events) {
        /** @type {Order} */
        const order = trade.order
        if ((order.takeProfitPrice < tick.price) && (tick.price < order.stopLossPrice)) { return }
        const baseQty = trade.open.quoteQty / tick.price
        this._baseQty += baseQty
        this._quoteQty -= trade.open.quoteQty
        this._quoteQty -= trade.open.quoteQty * order.feePercent
        this._orders.delete(order.id)
        console.log(this._quoteQty.toFixed(3), this._baseQty.toFixed(10), (this._quoteQty + this._baseQty * tick.price).toFixed(3))
        events.emit('orderClosed', order)
    }

    closeBuy (tick, trade, events) {
        /** @type {Order} */
        const order = trade.order
        if ((order.stopLossPrice < tick.price) && (tick.price < order.takeProfitPrice)) { return }
        const quoteQty = trade.open.baseQty * tick.price
        this._baseQty -= trade.open.baseQty
        this._quoteQty += quoteQty
        this._quoteQty -= quoteQty * order.feePercent
        this._orders.delete(order.id)
        console.log(this._quoteQty.toFixed(3), this._baseQty.toFixed(10), (this._quoteQty + this._baseQty * tick.price).toFixed(3))
        events.emit('orderClosed', order)
    }
}

class Wallet {
    constructor (events) {
        this.events = events
        this.events.on('openOrder', order => this.#onOpenOrder(order))
        this.events.on('tick', tick => this.#onTick(tick))
        this._slots = new Map()
    }

    #onOpenOrder (/** @type {Order} */ order) {
        this.#getSlot(order.symbol).openOrder(order)
    }

    #onTick (tick) {
        this.#getSlot(tick.symbol).tick(tick, this.events)
    }

    #getSlot (symbol) {
        const slot = this._slots.get(symbol.id)
        if (slot) { return slot }
        const newSlot = new WalletSlot(symbol)
        this._slots.set(symbol.id, newSlot)
        return newSlot
    }
}

module.exports = Wallet
