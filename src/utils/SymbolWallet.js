const { generatePng } = require('./utils')
const path = require('path')

class SymbolWallet {
    constructor (events, symbol, pathForImages) {
        this.symbol = symbol
        this.pathForImages = pathForImages
        this.events = events
        this.baseQty = 0
        this.quoteQty = 100
        this.events.on('orderOpen', evt => this.#onOrderOpen(evt))
        this.events.on('tick', evt => this.#onTick(evt))
        this.buyOrders = []
    }

    #onOrderOpen (evt) {
        if (evt.trade.type === 'buy') { return this.#onOrderOpenBuy(evt) }
    }

    #onOrderOpenBuy (evt) {
        evt.trade.baseQty = evt.trade.quoteQty / evt.trade.at
        evt.trade.spentQuoteQty = evt.trade.quoteQty * 1.001
        evt.trade.buyTick = evt.metadata.tick
        evt.trade.metadata = evt.metadata
        this.baseQty += evt.trade.baseQty
        this.quoteQty -= evt.trade.spentQuoteQty
        this.buyOrders.push(evt.trade)
        // console.log(`B: ${evt.metadata.tick.tsHr} - ${evt.trade.low.toFixed(8)} - ${evt.trade.at.toFixed(8)} - ${evt.trade.high.toFixed(8)} - ${evt.trade.spentQuoteQty.toFixed(8)}`)
    }

    #onTick (tick) {
        const doSell = (order, good) => {
            const quoteQty = order.baseQty * tick.price
            order.receivedQuoteQty = quoteQty * 0.999
            this.baseQty -= order.baseQty
            this.quoteQty += order.receivedQuoteQty
            this.events.emit('orderClosed')
            order.profitQty = order.receivedQuoteQty - order.spentQuoteQty
            const red = '\x1b[31m%s\x1b[0m'
            const green = '\x1b[32m%s\x1b[0m'
            const yellow = '\x1b[33m%s\x1b[0m'
            console.log(order.profitQty > 0 ? green : (good ? yellow : red), `${this.symbol}: ${order.metadata.startTsHr} ${order.buyTick.tsHr} ${tick.tsHr} - ${order.low.toFixed(8)} - ${order.at.toFixed(8)} - ${order.high.toFixed(8)} - ${order.spentQuoteQty.toFixed(8)} - ${order.receivedQuoteQty.toFixed(8)} - ${order.profitQty.toFixed(8)}`)
            generatePng(order, path.join(this.pathForImages, this.symbol, `${order.metadata.startTsHr}.png`))
            // console.log('---')
        }
        const kept = []
        for (const order of this.buyOrders) {
            if (tick.price <= order.low) {
                doSell(order, false)
                continue
            }
            if (tick.price >= order.high) {
                doSell(order, true)
                continue
            }
            kept.push(order)
        }
        this.buyOrders = kept
    }
}

module.exports = SymbolWallet
