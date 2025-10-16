class Symbol {
    constructor (baseAssetName, quoteAssetName) {
        this.baseAssetName = baseAssetName
        this.quoteAssetName = quoteAssetName
    }

    get name () { return `${this.baseAssetName}-${this.quoteAssetName}` }

    static find (alias) { return symbolsByAliases.get(alias) }
}

const allInfo = require('./allsymbols.json')
const allAssets = new Set(allInfo.assets.map(a => a.toLocaleLowerCase()))
const allSymbols = allInfo.symbols.map(raw => [
    raw[0].toLocaleLowerCase(),
    raw[1].toLocaleLowerCase(),
    ...raw.slice(2),
    ...raw.slice(2).map(r => r.toLocaleLowerCase()),
    ...raw.slice(2).map(r => r.toLocaleUpperCase())
]).map(([baseAssetName, quoteAssetName, ...aliases]) => {
    if (!(allAssets.has(baseAssetName) && allAssets.has(quoteAssetName))) { throw new Error(`Invalid symbol: ${JSON.stringify([baseAssetName, quoteAssetName, ...aliases])}`) }
    return { symbol: new Symbol(baseAssetName, quoteAssetName), aliases: new Set([...aliases]) }
})
const symbolsByAliases = allSymbols.reduce((dst, src) => {
    src.aliases.forEach(alias => {
        if (dst.has(alias)) {
            throw new Error(`Alias ${alias} is used 2 or more times`)
        }
        dst.set(alias, src.symbol)
    })
    return dst
}, new Map())

module.exports = Symbol
