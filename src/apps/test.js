const { EventEmitter } = require('events')
const SourceDb = require('../sources/SourceDb')
const Candles = require('../instruments/Candles')
const RideTheWave = require('../strategies/RideTheWave')
const Wallet = require('../utils/Wallet')

const events = new EventEmitter()

// events.on('candleOpen', (evt) => console.log('candleOpen', evt.candle.info))
// events.on('candleUpdate', (evt) => console.log('candleUpdate', evt.candle.info))
// events.on('candleClose', (evt) => console.log('candleClose', evt.candle.info))

async function main () {
    const sourceDb = await SourceDb.create(events, {
        url: 'http://127.0.0.1:8123',
        user: 'default',
        password: '' // you can leave blank if not set
    })
    const candles = new Candles(events, 1000000 * 60)
    const strategy = new RideTheWave(events)
    const wallet = new Wallet(events)
    await sourceDb.start()
    sourceDb.close()
}

main()
