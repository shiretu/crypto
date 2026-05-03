import Asset from './Asset.js'
import { getAsset } from './AssetList.js'

export default class Symbol {
    #exchange
    #base
    #quote

    constructor (base, quote) {
        if (!(base instanceof Asset)) throw new Error('base must be an Asset')
        if (!(quote instanceof Asset)) throw new Error('quote must be an Asset')
        this.#base = base
        this.#quote = quote
        this.#exchange = null
    }

    get base () { return this.#base }
    get quote () { return this.#quote }
    get exchange () { return this.#exchange }

    set exchange (exchange) {
        if (this.#exchange) throw new Error(`Symbol ${this.pairId} already belongs to ${this.#exchange.id}`)
        this.#exchange = exchange
    }

    get pairId () {
        return `${this.#base.id}:${this.#quote.id}`
    }

    get id () {
        if (!this.#exchange) return `:${this.pairId}`
        return `${this.#exchange.id}:${this.pairId}`
    }

    toString () {
        return `${this.#base}/${this.#quote}`
    }

    static parse (str) {
        const cleaned = str.replace(/[^a-zA-Z]/g, '').toLowerCase()

        for (const quote of ['usdc', 'usdt', 'busd', 'usd', 'btc', 'eth', 'bnb']) {
            if (cleaned.endsWith(quote) && cleaned.length > quote.length) {
                return new Symbol(getAsset(cleaned.slice(0, -quote.length)), getAsset(quote))
            }
        }

        throw new Error(`Cannot parse symbol: ${str}`)
    }
}
