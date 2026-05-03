import Asset from './Asset.js'

const assets = new Map()

const add = (id, ...aliases) => {
    const a = new Asset(id)
    assets.set(a.id, a)
    for (const alias of aliases) {
        assets.set(alias.toLowerCase(), a)
    }
    return a
}

// Stablecoins
add('usdt')
add('usdc', '$c')
add('busd')
add('dai')
add('tusd')
add('usdp')
add('fdusd')

// Major cryptocurrencies
add('btc')
add('eth')
add('bnb')
add('sol')
add('xrp')
add('ada')
add('doge')
add('avax')
add('dot')
add('matic')
add('link')
add('ltc')
add('bch')
add('xlm')
add('atom')
add('uni')
add('etc')
add('fil')
add('ape')
add('near')
add('algo')
add('icp')
add('vet')
add('ftm')
add('sand')
add('mana')
add('axs')
add('aave')
add('egld')
add('eos')
add('theta')
add('xtz')
add('hbar')
add('trx')
add('shib')
add('arb')
add('op')
add('apt')
add('sui')
add('sei')
add('pepe')
add('wif')
add('bonk')
add('render')
add('inj')
add('fet')
add('grt')
add('mkr')
add('snx')
add('crv')
add('ldo')
add('rune')
add('ton')

// Fiat
add('usd')
add('eur')
add('gbp')
add('jpy')

export const getAsset = (name) => {
    const a = assets.get(name.toLowerCase())
    if (!a) throw new Error(`Unknown asset: ${name}`)
    return a
}

export const hasAsset = (name) => assets.has(name.toLowerCase())

export const allAssets = () => [...new Set(assets.values())]
