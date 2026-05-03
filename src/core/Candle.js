import Trade from './Trade.js'
import { isValidDuration } from './CandleDuration.js'

export default class Candle {
    #index
    #targetDurationSec
    #open
    #close
    #high
    #low

    constructor (targetDurationSec, firstTrade) {
        if (!isValidDuration(targetDurationSec)) throw new Error(`Invalid candle duration: ${targetDurationSec}`)
        if (!(firstTrade instanceof Trade)) throw new Error('firstTrade must be a Trade')
        this.#targetDurationSec = targetDurationSec
        this.#index = Math.floor(firstTrade.tsUs / (targetDurationSec * 1_000_000))
        this.#open = firstTrade
        this.#close = firstTrade
        this.#high = firstTrade
        this.#low = firstTrade
    }

    get index () { return this.#index }
    get id () { return `${this.#open.symbol.id}:${this.#targetDurationSec}:${this.#index}` }
    get targetDurationSec () { return this.#targetDurationSec }
    get open () { return this.#open }
    get close () { return this.#close }
    get high () { return this.#high }
    get low () { return this.#low }

    update (trade) {
        if (!(trade instanceof Trade)) throw new Error('trade must be a Trade')
        if (trade.tsUs < this.#close.tsUs) {
            throw new Error(`Trade timestamp ${trade.tsUs} is earlier than last trade ${this.#close.tsUs}`)
        }
        this.#close = trade
        if (trade.price > this.#high.price) this.#high = trade
        if (trade.price < this.#low.price) this.#low = trade
    }

    static fromTrades (targetDurationSec, trades) {
        if (!trades.length) throw new Error('Cannot create Candle from empty trades')
        const candle = new Candle(targetDurationSec, trades[0])
        for (let i = 1; i < trades.length; i++) {
            candle.update(trades[i])
        }
        return candle
    }
}
