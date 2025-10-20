const { EventEmitter } = require('events')
const { getSource } = require('./sources/sources')
const Trade = require('./core/Trade')
const Candle = require('./core/Candle')
const Symbol = require('./core/Symbol')
const EventName = require('./core/EventName')
const { getStrategy } = require('./strategies/strategies')

const work = async () => {
    const events = new EventEmitter()

    const symbol = Symbol.find('btcusdc')
    const exchangeName = 'binance'
    const strategyName = 'newWave'
    const source = await getSource(events, exchangeName, symbol.id)
    source.createCandlesGenerator(1)
    getStrategy(events, strategyName, exchangeName, symbol)

    // createWallet(events)
    // createStrategy(events, 'newWaves')
    await source.run(0)
}

work()
