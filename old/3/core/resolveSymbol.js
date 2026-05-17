import Symbol from './Symbol.js'
import { getExchange } from '../exchanges/index.js'
import { getAsset } from './assets.js'

export const resolveSymbol = (str) => {
    const parts = str.split(':')
    if (parts.length !== 3) throw new Error(`Invalid symbol format: ${str} (expected exchange:base:quote or :base:quote)`)
    const [exchangeId, base, quote] = parts
    if (exchangeId) {
        return getExchange(exchangeId).getSymbol(`${base}:${quote}`)
    }
    return new Symbol(getAsset(base), getAsset(quote))
}
