class Order {
    #open
    #close

    constructor (open, close) {
        this.#open = open
        this.#close = close
    }

    get open () { return this.#open }
    get close () { return this.#close }
    get durationUs () { return this.#close.tsUs - this.#open.tsUs }
}

class LongOrder extends Order {
    get profitPercent () { return (this.close.price - this.open.price) / this.open.price * 100 }
}

class ShortOrder extends Order {
    get profitPercent () { return (this.open.price - this.close.price) / this.open.price * 100 }
}

export { Order, LongOrder, ShortOrder }
