const { EventEmitter } = require('events')
const SourceDb = require('../sources/SourceDb')
const Candles = require('../instruments/Candles')

const events = new EventEmitter()

// events.on('candleOpen', (candle) => console.log('candleOpen', candle.info))
// events.on('candleUpdate', (candle) => console.log('candleUpdate', candle.info))
events.on('candleClose', (candle) => console.log('candleClose', candle.info))

async function main () {
    const sourceDb = await SourceDb.create(events, {
        url: 'http://127.0.0.1:8123',
        user: 'default',
        password: '' // you can leave blank if not set
    })
    const candles = new Candles(events, 1000000 * 60)
    await sourceDb.start()
    sourceDb.close()
}

main()
