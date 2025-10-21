const { EventEmitter } = require('events')
const { getSource } = require('./sources/sources')
const Symbol = require('./core/Symbol')
const { getSignal } = require('./signals/signals')
const CandlesGenerator = require('./core/CandlesGenerator')

const work = async () => {
    const events = new EventEmitter()
    const exchangeName = 'binance'
    const symbol = Symbol.find('btcusdc')
    const strategyName = 'sLine'

    const source = await getSource(events, exchangeName, symbol)
    console.log('Source initialized: ', source)

    const candlesGenerator = new CandlesGenerator(events, exchangeName, symbol, 1)
    console.log('CandlesGenerator initialized: ', candlesGenerator)

    const signal = await getSignal(events, strategyName, exchangeName, symbol)
    console.log('Signal initialized: ', signal)

    await source.run(0)
}

work()
