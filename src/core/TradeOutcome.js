import { LongOrder, ShortOrder } from './Order.js'

export default class TradeOutcome {
    #tpPercent
    #slPercent
    #openTrade
    #longTrade
    #shortTrade

    constructor ({ tpPercent, slPercent, trade }) {
        if (tpPercent <= 0) throw new Error('tpPercent must be positive')
        if (slPercent <= 0) throw new Error('slPercent must be positive')
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
        this.#openTrade = trade
        this.#longTrade = null
        this.#shortTrade = null
    }

    get completed () { return this.#longTrade !== null && this.#shortTrade !== null }
    get longOrder () { return this.#longTrade ? new LongOrder(this.#openTrade, this.#longTrade) : null }
    get shortOrder () { return this.#shortTrade ? new ShortOrder(this.#openTrade, this.#shortTrade) : null }

    update (trade) {
        const price = trade.price
        const openPrice = this.#openTrade.price

        if (this.#longTrade === null) {
            if (price >= openPrice * (1 + this.#tpPercent / 100)) {
                this.#longTrade = trade
            } else if (price <= openPrice * (1 - this.#slPercent / 100)) {
                this.#longTrade = trade
            }
        }

        if (this.#shortTrade === null) {
            if (price <= openPrice * (1 - this.#tpPercent / 100)) {
                this.#shortTrade = trade
            } else if (price >= openPrice * (1 + this.#slPercent / 100)) {
                this.#shortTrade = trade
            }
        }

        return this.completed
    }
}
