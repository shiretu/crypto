import { getExchange } from '../exchanges/index.js'

/**
 * Parse an "exchange:base:quote" string into a Symbol bound to an Exchange.
 * @param {string} str - e.g. "binance:eth:usdc"
 * @returns {Symbol} with exchange set
 * @throws {Error} if the format is invalid or exchange/asset not found
 */
export const resolveSymbol = (str) => {
    const parts = str.split(':')
    if (parts.length !== 3) throw new Error(`Invalid symbol format: ${str} (expected exchange:base:quote)`)
    const [exchangeId, base, quote] = parts
    if (!exchangeId || !base || !quote) throw new Error(`Invalid symbol format: ${str} (expected exchange:base:quote)`)
    return getExchange(exchangeId).getSymbol(`${base}:${quote}`)
}
