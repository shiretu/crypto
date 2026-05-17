import { binance } from './binance.js'

const registry = new Map()

const register = (exchange) => {
    registry.set(exchange.id, exchange)
}

register(binance)

export const getExchange = (name) => {
    const ex = registry.get(name.toLowerCase())
    if (!ex) throw new Error(`Exchange not found: ${name}`)
    return ex
}

export const allExchanges = () => [...registry.values()]
