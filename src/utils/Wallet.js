class Wallet {
    constructor (events) {
        this.events = events
        this.btc = 0n
        this.usdt = 10000000000n
        this.events.on('orderOpen', evt => this.#onOrderOpen(evt))
        this.events.on('tick', evt => this.#onTick(evt))
        this.buyOrders = []
    }

    #onOrderOpen (evt) {
        if (evt.trade.type === 'buy') { return this.#onOrderOpenBuy(evt) }
    }

    #onOrderOpenBuy (evt) {
        evt.trade.qty = evt.trade.quoteQty / evt.trade.at
        this.btc += evt.trade.qty
        this.usdt -= (evt.trade.quoteQty * 1001n) / 1000n
        this.buyOrders.push(evt.trade)
        console.log(`B: ${this.btc}/${this.usdt} - ${evt.trade.at}`)
    }

    #onTick (tick) {
        const doSell = (order, good) => {
            this.btc -= order.qty
            const usdt = order.qty * tick.price
            this.usdt += usdt * 999n / 1000n
            this.events.emit('orderClosed')
            console.log(`S: ${this.btc}/${this.usdt} - ${tick.price} - ${good ? 'U' : 'D'}`)
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
