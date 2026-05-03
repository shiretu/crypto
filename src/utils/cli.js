import { getExchange } from '../exchanges/index.js'

export const resolveExchangeAndSymbol = (exchangeId, symbolId) => {
    let exchange
    try {
        exchange = getExchange(exchangeId)
    } catch {
        console.error(`Unknown exchange: ${exchangeId}`)
        process.exit(1)
    }

    let symbol
    try {
        symbol = exchange.getSymbol(symbolId)
    } catch {
        console.error(`Unknown symbol: ${symbolId} on ${exchangeId}`)
        console.error(`Available: ${exchange.symbols.map(s => s.pairId).join(', ')}`)
        process.exit(1)
    }

    return { exchange, symbol }
}
