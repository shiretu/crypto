/* eslint-env mocha */
const assert = require('assert')
const EventEmitter = require('events')
const CandlesGenerator = require('../src/core/CandlesGenerator')
const Candle = require('../src/core/Candle')
const Symbol = require('../src/core/Symbol')
const Trade = require('../src/core/Trade')

describe('CandlesGenerator', () => {
    function makeTrade (tsUs, price, baseQty = 1, quoteQty = 100, isBuyerMaker = false) {
        // Use BTC/USDC as a valid symbol
        const symbol = new Symbol('BTC', 'USDC')
        return new Trade(
            'binance',
            symbol,
            'localId',
            'remoteId',
            'orderLocalId',
            tsUs,
            price,
            baseQty,
            quoteQty,
            isBuyerMaker
        )
    }

    it('should create a new candle on first trade', () => {
        const events = new EventEmitter()
        const symbol = new Symbol('BTC', 'USDC')
        const cg = new CandlesGenerator(events, 'binance', symbol, 1)
        const trade = makeTrade(0, 100)
        const closed = cg.feed(trade)
        assert.strictEqual(closed, null)
    })

    it('should close previous candle and start new one on new candle interval', () => {
        const events = new EventEmitter()
        const symbol = new Symbol('BTC', 'USDC')
        const cg = new CandlesGenerator(events, 'binance', symbol, 1)
        const trade1 = makeTrade(0, 100)
        cg.feed(trade1)
        const trade2 = makeTrade(60000000, 101)
        const closed = cg.feed(trade2)
        assert(closed instanceof Candle)
        assert.notStrictEqual(closed, null)
        assert.strictEqual(closed.open.price, 100)
        assert.strictEqual(closed.close.price, 100)
    })

    it('should update the current candle with trades in the same interval', () => {
        const events = new EventEmitter()
        const symbol = new Symbol('BTC', 'USDC')
        const cg = new CandlesGenerator(events, 'binance', symbol, 1)
        const trade1 = makeTrade(0, 100)
        cg.feed(trade1)
        const trade2 = makeTrade(1000000, 105)
        cg.feed(trade2)
        // The current candle should not be closed yet
        const trade3 = makeTrade(2000000, 110)
        const closed = cg.feed(trade3)
        assert.strictEqual(closed, null)
    })

    it('should reset the current candle', () => {
        const events = new EventEmitter()
        const symbol = new Symbol('BTC', 'USDC')
        const cg = new CandlesGenerator(events, 'binance', symbol, 1)
        const trade = makeTrade(0, 100)
        cg.feed(trade)
        cg.reset()
        // After reset, a new trade should create a new candle
        const trade2 = makeTrade(1000000, 105)
        const closed = cg.feed(trade2)
        assert.strictEqual(closed, null)
    })
})
