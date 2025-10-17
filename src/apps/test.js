const { EventEmitter } = require('events')
const BinanceDb = require('../sources/BinanceDb')
const Candles = require('../core/Candles')
const RideTheWave = require('../strategies/RideTheWave')
const Mamas = require('../strategies/Mamas')
const SymbolWallet = require('../utils/SymbolWallet')
const path = require('path')
const Symbol = require('../core/Symbol')
const { dayStart, dayDurationMs } = require('../utils/utils')
const NewWave = require('../strategies/NewWave')

const events = new EventEmitter()

// events.on('candleOpen', (evt) => console.log('candleOpen', evt.candle.info))
// events.on('candleUpdate', (evt) => console.log('candleUpdate', evt.candle.info))
// events.on('candleClose', (evt) => {
//     const info = evt.candle.info
//     console.log(`${info.ts},${info.open.toFixed(8)},${info.high.toFixed(8)},${info.low.toFixed(8)},${info.close.toFixed(8)},${info.baseVolume.toFixed(8)},${info.ts + 60 * 1000 * 1000 - 1},${info.quoteVolume.toFixed(8)},${info.tradesCount},${info.takerBuyBaseVolume.toFixed(8)},${info.takerBuyQuoteVolume.toFixed(8)},0`)
// })

async function main () {
    console.log(process.argv)
    const symbolName = (process.argv && process.argv.length >= 3) ? process.argv[2] : 'BTCUSDC'
    const dbConf = {
        url: 'http://127.0.0.1:8123',
        user: 'default',
        password: '' // you can leave blank if not set
    }
    const binanceDb = await BinanceDb.create(events, dbConf, symbolName, 60)
    const candles = new Candles(events, 1)
    // const strategy = new RideTheWave(events)
    const strategy = new NewWave(events)
    // const strategy = new Mamas(events)
    const symbolWallet = new SymbolWallet(events, Symbol.find(symbolName), path.resolve(path.join(path.resolve(__dirname), '..', '..', 'trades')))
    await binanceDb.start(dayStart(Date.now()) - 3 * dayDurationMs)
    binanceDb.close()
    console.log('Done')
}

main()
