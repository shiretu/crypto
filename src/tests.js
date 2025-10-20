const { EventEmitter } = require('events')
const { getSource } = require('./sources/sources')
const Symbol = require('./core/Symbol')
const { getStrategy } = require('./strategies/strategies')
const CandlesGenerator = require('./core/CandlesGenerator')

const work = async () => {
    const events = new EventEmitter()
    const exchangeName = 'binance'
    const symbol = Symbol.find('btcusdc')
    const strategyName = 'newWave'

    const source = await getSource(events, exchangeName, symbol)
    console.log('Source initialized: ', source)

    const candlesGenerator = new CandlesGenerator(events, exchangeName, symbol, 1)
    console.log('CandlesGenerator initialized: ', candlesGenerator)

    const strategy = await getStrategy(events, strategyName, exchangeName, symbol)
    console.log('Strategy initialized: ', strategy)

    // createWallet(events)
    // createStrategy(events, 'newWaves')
    await source.run(0)
}

work()
