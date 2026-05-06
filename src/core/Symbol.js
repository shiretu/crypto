import Asset from './Asset.js'
import { getAsset } from './assets.js'

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
        return this.id
    }
}
