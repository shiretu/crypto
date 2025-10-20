const { EventEmitter } = require('events')
const { getSource } = require('./sources/sources')
const Trade = require('./core/Trade')
const Candle = require('./core/Candle')
const Symbol = require('./core/Symbol')
const EventName = require('./core/EventName')

const work = async () => {
    const events = new EventEmitter()

    const symbol = Symbol.find('btcusdc')
    const exchangeName = 'binance'
    const source = await getSource(events, exchangeName, symbol.id)
    source.createCandlesGenerator(1)
    events.on(EventName.ofCandle(EventName.ACTION.CLOSED, exchangeName, symbol.id),
        (/** @type {Candle} */ e) => {
            console.log(e.id)
        }
    )
    // createWallet(events)
    // createStrategy(events, 'newWaves')
    await source.run(0)
}

work()
