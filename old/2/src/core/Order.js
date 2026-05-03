/* eslint-disable no-unused-vars */
const Trade = require('../core/Trade')
const TradeKind = require('../core/TradeKind')
/* eslint-enable no-unused-vars */

class Order {
    #kind /** @type {TradeKind} */
    #stopLossPercent /** @type {number} */
    #takeProfitPercent /** @type {number} */
    #enter /** @type {Trade} */
    #last /** @type {Trade} */
    #profitFnc /** @type {() => number} */

    constructor (kind, stopLossPercent, takeProfitPercent) {
        this.#kind = kind
        this.#stopLossPercent = stopLossPercent
        this.#takeProfitPercent = takeProfitPercent
        this.#profitFnc = this.#kind === TradeKind.buy
            ? () => this.#last.price - this.#enter.price
            : () => this.#enter.price - this.#last.price
    }

    static create (kind, stopLossPercent, takeProfitPercent) {
        return new Order(kind, stopLossPercent, takeProfitPercent)
    }

    pushTrade (trade) {
        if ((this.#kind !== trade.kind) || (this.isClosed)) { return }
        if (!this.#enter) {
            this.#enter = trade
        }
        this.#last = trade
    }

    get kind () { return this.#kind }
    get enter () { return this.#enter }
    get last () { return this.#last }

    get profit () {
        if (!this.#last) { return null }
        return this.#profitFnc()
    }

    get profitPercent () {
        if (!this.#last) { return null }
        return this.profit / this.#enter.price
    }

    get ageUs () {
        if (!this.#last || !this.#enter) { return null }
        return this.#last.tsUs - this.#enter.tsUs
    }

    get isStopLossHit () {
        if (!this.#last || !this.#enter) { return false }
        return this.profitPercent <= -this.#stopLossPercent
    }

    get isTakeProfitHit () {
        if (!this.#last || !this.#enter) { return false }
        return this.profitPercent >= this.#takeProfitPercent
    }

    get isClosed () {
        return this.isStopLossHit || this.isTakeProfitHit
    }
}

module.exports = Order
