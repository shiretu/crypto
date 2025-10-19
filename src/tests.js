const { EventEmitter } = require('events')
const { getSource } = require('./sources/sources')
const Trade = require('./core/Trade')
const { Candle } = require('./core/Candle')

const work = async () => {
    const events = new EventEmitter()
    events.on('candleClosed', (/** @type {Candle} */ e) => { console.log(e.id) })
    const source = await getSource(events, 'binance', 'btcusdc')
    source.createCandlesGenerator(1)
    // createWallet(events)
    // createStrategy(events, 'newWaves')
    await source.run(0)
}

work()
