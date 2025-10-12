class Wallet {
    constructor (events) {
        this.events = events
        this.btc = 0
        this.usdt = 100
        this.events.on('orderOpen', evt => this.#onOrderOpen(evt))
        this.events.on('tick', evt => this.#onTick(evt))
        this.buyOrders = []
    }

    #onOrderOpen (evt) {
        if (evt.trade.type === 'buy') { return this.#onOrderOpenBuy(evt) }
    }

    #onOrderOpenBuy (evt) {
        evt.trade.qty = evt.trade.quoteQty / evt.trade.at
        evt.trade.spentQuote = evt.trade.quoteQty * 1.001
        evt.trade.buyTick = evt.metadata.tick
        this.btc += evt.trade.qty
        this.usdt -= evt.trade.spentQuote
        this.buyOrders.push(evt.trade)
        // console.log(`B: ${evt.metadata.tick.tsHr} - ${evt.trade.low.toFixed(8)} - ${evt.trade.at.toFixed(8)} - ${evt.trade.high.toFixed(8)} - ${evt.trade.spentQuote.toFixed(8)}`)
    }

    #onTick (tick) {
        const doSell = (order, good) => {
            const usdt = order.qty * tick.price
            order.receivedQuote = usdt * 0.999
            this.btc -= order.qty
            this.usdt += order.receivedQuote
            this.events.emit('orderClosed')
            const gain = order.receivedQuote - order.spentQuote
            const red = '\x1b[31m%s\x1b[0m'
            const green = '\x1b[32m%s\x1b[0m'
            const yellow = '\x1b[33m%s\x1b[0m'
            console.log(gain > 0 ? green : (good ? yellow : red), `S: ${order.buyTick.tsHr} ${tick.tsHr} - ${order.low.toFixed(8)} - ${order.at.toFixed(8)} - ${order.high.toFixed(8)} - ${order.spentQuote.toFixed(8)} - ${order.receivedQuote.toFixed(8)} - ${gain.toFixed(8)}`)
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

module.exports = Wallet
