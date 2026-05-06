import Trade from './Trade.js'
import { isValidDuration } from './CandleDuration.js'
import CandleRef from './CandleRef.js'

export default class Candle {
    #targetDurationSec
    #ordinal
    #open
    #close
    #high
    #low

    constructor (targetDurationSec, firstTrade) {
        if (!isValidDuration(targetDurationSec)) throw new Error(`Invalid candle duration: ${targetDurationSec}`)
        if (!(firstTrade instanceof Trade)) throw new Error('firstTrade must be a Trade')
        this.#targetDurationSec = targetDurationSec
        this.#ordinal = Math.floor(firstTrade.tsUs / (this.#targetDurationSec * 1_000_000))
        this.#open = firstTrade
        this.#close = firstTrade
        this.#high = firstTrade
        this.#low = firstTrade
    }

    get targetDurationSec () { return this.#targetDurationSec }
    get ordinal () { return this.#ordinal }
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

    static fromRef (targetDurationSec, ref, tradesStore) {
        const open = tradesStore.getAt(ref.openTsUs, ref.openIndex)
        const candle = new Candle(targetDurationSec, open)
        candle.#close = tradesStore.getAt(ref.closeTsUs, ref.closeIndex)
        candle.#high = tradesStore.getAt(ref.highTsUs, ref.highIndex)
        candle.#low = tradesStore.getAt(ref.lowTsUs, ref.lowIndex)
        return candle
    }
}
