const { EventEmitter } = require('events')
const Symbol = require('../core/Symbol')
const { getSource } = require('./sources/sources')
const CandlesGenerator = require('./core/CandlesGenerator')

const work = async () => {
    const exchangeName = 'binance'
    const symbolName = 'btcusdc'

    const events = new EventEmitter()
    const symbol = Symbol.find(symbolName)

    const source = await getSource(events, exchangeName, symbol, 365 * 4)
    console.log('Source initialized: ', source)

    const candlesGenerator = new CandlesGenerator(events, exchangeName, symbol, 15)
    console.log('CandlesGenerator initialized: ', candlesGenerator)

    await source.run(0)
}

work()
