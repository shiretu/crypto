/**
 * Represents a trading symbol (base/quote pair).
 */
class Symbol {
    static #allAssets /** @type {Set<string>} */
    static #allSymbols /** @type {Array<{ symbol: Symbol, aliases: Set<string> }> } */
    static #symbolsByAliases /** @type {Map<string, Symbol>} */

    #id /** @type {string} */
    #baseAssetName /** @type {string} */
    #quoteAssetName /** @type {string} */

    /**
     * Create a Symbol
     * @param {string} baseAssetName - base asset (e.g. BTC)
     * @param {string} quoteAssetName - quote asset (e.g. USDT)
     */
    constructor (baseAssetName, quoteAssetName) {
        this.#baseAssetName = baseAssetName.toLowerCase()
        this.#quoteAssetName = quoteAssetName.toLowerCase()
        if (!Symbol.#allAssets.has(this.#baseAssetName)) { throw new Error(`Invalid asset name: base: ${baseAssetName}`) }
        if (!Symbol.#allAssets.has(this.#quoteAssetName)) { throw new Error(`Invalid asset name: quote: ${quoteAssetName}`) }
        this.#id = this.name('', false)
    }

    /**
     * Unique identifier for the symbol (lowercase concatenation of base and quote)
     * @returns {string}
     */
    get id () { return this.#id }

    /**
     * Base asset name
     * @returns {string}
     */
    get baseAssetName () { return this.#baseAssetName }

    /**
     * Quote asset name
     * @returns {string}
     */
    get quoteAssetName () { return this.#quoteAssetName }

    /**
     * Format the symbol name using a separator and case option.
     * @param {string} [separator=''] - separator inserted between base and quote
     * @param {boolean} [uppercase=true] - whether to return the name in uppercase
     * @returns {string}
     */
    name (separator = '', uppercase = true) {
        const result = `${this.baseAssetName}${separator}${this.quoteAssetName}`
        return uppercase ? result.toLocaleUpperCase() : result.toLocaleLowerCase()
    }

    /**
     * Find a Symbol instance by an alias.
     * @param {string} alias - alias to look up (case-sensitive as populated)
     * @returns {Symbol}
     * @throws {Error} if alias is not found
     */
    static find (alias) {
        const result = this.#symbolsByAliases.get(alias.toLowerCase())
        if (result) { return result }
        throw new Error(`Symbol ${alias} not found`)
    }

    static {
        const allInfo = require('./allsymbols.json')
        Symbol.#allAssets = new Set(allInfo.assets.map(a => a.toLocaleLowerCase()))
        Symbol.#allSymbols = allInfo.symbols.map(raw => [
            raw[0].toLocaleLowerCase(),
            raw[1].toLocaleLowerCase(),
            ...raw.slice(2),
            ...raw.slice(2).map(r => r.toLocaleLowerCase()),
            ...raw.slice(2).map(r => r.toLocaleUpperCase())
        ]).map(([baseAssetName, quoteAssetName, ...aliases]) => {
            if (!(Symbol.#allAssets.has(baseAssetName) && Symbol.#allAssets.has(quoteAssetName))) { throw new Error(`Invalid symbol: ${JSON.stringify([baseAssetName, quoteAssetName, ...aliases])}`) }
            return { symbol: new Symbol(baseAssetName, quoteAssetName), aliases: new Set([...aliases.map(a => a.toLowerCase())]) }
        })
        Symbol.#symbolsByAliases = Symbol.#allSymbols.reduce((dst, src) => {
            src.aliases.forEach(alias => {
                if (dst.has(alias)) {
                    throw new Error(`Alias ${alias} is used 2 or more times`)
                }
                dst.set(alias, src.symbol)
            })
            return dst
        }, new Map())
    }
}

module.exports = Symbol
