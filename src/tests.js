const { EventEmitter } = require('events')
const { getSource } = require('./sources/sources')
const Symbol = require('./core/Symbol')
const { getSignal } = require('./signals/signals')
const CandlesGenerator = require('./core/CandlesGenerator')
const EventName = require('./core/EventName')

const work = async () => {
    const events = new EventEmitter()
    const exchangeName = 'binance'
    const symbol = Symbol.find('btcusdc')

    const source = await getSource(events, exchangeName, symbol)
    console.log('Source initialized: ', source)

    const candlesGenerator = new CandlesGenerator(events, exchangeName, symbol, 1)
    console.log('CandlesGenerator initialized: ', candlesGenerator)

    const signals = {
        sLine: await getSignal('sLine', events, exchangeName, symbol),
        fvg: await getSignal('fvg', events, exchangeName, symbol)
    }

    events.on(EventName.ofSignal(signals.sLine.name, exchangeName, symbol.id), (evt) => {
        console.log('sLine event received', evt)
    })

    events.on(EventName.ofSignal(signals.fvg.name, exchangeName, symbol.id), (evt) => {
        console.log('fvg event received', evt[0].tsHr)
    })

    await source.run(0)
}

work()
