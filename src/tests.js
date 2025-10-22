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

    const candlesGenerator = new CandlesGenerator(events, exchangeName, symbol, 15)
    console.log('CandlesGenerator initialized: ', candlesGenerator)

    const signals = {
        sLine: await getSignal('sLine', events, exchangeName, symbol),
        fvg: await getSignal('fvg', events, exchangeName, symbol),
        simpleEma: await getSignal('simpleema', events, exchangeName, symbol, 9)
    }

    events.on(EventName.ofSignal(signals.sLine.name, exchangeName, symbol.id), (evt) => {
        console.log('sLine event received', evt)
    })

    events.on(EventName.ofSignal(signals.fvg.name, exchangeName, symbol.id), (/** @type {Candle[]} */ candles) => {
        const size = (candles[0].direction > 0) ? (candles[2].prices.low - candles[0].prices.high) : (candles[0].prices.low - candles[2].prices.high)
        console.log('fvg event received', candles[0].tsHr, size)
    })

    await source.run(0)
}

work()
