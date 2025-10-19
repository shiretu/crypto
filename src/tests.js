const { EventEmitter } = require('events')
const { getSource } = require('./sources/sources')

const work = async () => {
    const events = new EventEmitter()
    events.on('trade', (e) => {
        console.log(e)
    })
    const source = await getSource(events, 'binance', 'btcusdc')
    // createWallet(events)
    // createStrategy(events, 'newWaves')
    await source.run(0)
}

work()
