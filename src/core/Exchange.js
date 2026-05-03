export default class Exchange {
    #id
    #symbols
    #downloader

    constructor (id, symbols = [], downloader = null) {
        this.#id = id.toLowerCase()
        this.#symbols = new Map()
        this.#downloader = downloader
        for (const s of symbols) {
            s.exchange = this
            this.#symbols.set(s.pairId, s)
        }
    }

    get id () { return this.#id }

    get symbols () { return [...this.#symbols.values()] }

    get assets () {
        return [...new Set(this.symbols.flatMap(s => [s.base, s.quote]))].sort((a, b) => a.id.localeCompare(b.id))
    }

    get downloader () { return this.#downloader }

    hasSymbol (symbol) {
        return this.#symbols.has(symbol.pairId)
    }

    getSymbol (id) {
        const s = this.#symbols.get(id.toLowerCase())
        if (!s) throw new Error(`Symbol ${id} not found on ${this.#id}`)
        return s
    }

    toString () {
        return this.#id
    }
}
