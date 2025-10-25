const { EventEmitter } = require('events')
const Symbol = require('../core/Symbol')
const Candle = require('../core/Candle')
const { getSource } = require('../sources/sources')
const CandlesGenerator = require('../core/CandlesGenerator')
const EventName = require('../core/EventName')

const work = async () => {
    const exchangeName = 'binance'
    const symbolName = 'btcusdc'

    const events = new EventEmitter()
    const symbol = Symbol.find(symbolName)

    const source = await getSource(events, exchangeName, symbol, 365 * 4)
    console.log('Source initialized: ', source)

    const candlesGenerator = new CandlesGenerator(events, exchangeName, symbol, 1)
    console.log('CandlesGenerator initialized: ', candlesGenerator)

    let lastPrinted30DayUs = 0
    let totalTrades = 0
    let firstTradeTsUs
    let lastTradeTsUs
    let candleCount = 0
    events.on(EventName.ofCandle(EventName.ACTION.CLOSED, exchangeName, symbol.id), (/** @type {Candle} */ candle) => {
        candleCount++
        if (!firstTradeTsUs) {
            firstTradeTsUs = candle.open.tsUs
        }
        lastTradeTsUs = candle.close.tsUs
        totalTrades += candle.tradeCount
        if (candle.tsUs.close - lastPrinted30DayUs > 24 * 60 * 60 * 1000 * 1000 * 30) {
            lastPrinted30DayUs = candle.tsUs.close
            console.log('New day: ', new Date(candle.tsUs.close / 1000).toISOString())
        }
    })

    await source.run(0)

    console.log(`Processed ${totalTrades} trades from ${new Date(firstTradeTsUs / 1000).toISOString()} to ${new Date(lastTradeTsUs / 1000).toISOString()} as ${candleCount} candles`)
}

work()
