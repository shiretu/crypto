import { getExchange } from '../exchanges/index.js'

export const resolveExchangeAndSymbol = (exchangeId, symbolId) => {
    try {
        const exchange = getExchange(exchangeId)
        const symbol = exchange.getSymbol(symbolId)
        return { exchange, symbol }
    } catch (e) {
        console.error(e.message)
        process.exit(1)
    }
}
