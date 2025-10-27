/* eslint-env mocha */
const assert = require('assert')
const Symbol = require('../src/core/Symbol')
const Trade = require('../src/core/Trade')
const Candle = require('../src/core/Candle')

describe('Candle', function () {
    const symbol = new Symbol('BTC', 'USDC')
    function makeTrade (tsUs, price, baseQty = 1, quoteQty = 100, isBuyerMaker = false) {
        return new Trade('binance', symbol, 'lid', 'rid', 'olid', tsUs, price, baseQty, quoteQty, isBuyerMaker)
    }

    it('should construct with correct initial values', function () {
        const trade = makeTrade(1000000, 42000, 0.1, 4200, true)
        const candle = new Candle('binance', symbol, 1, 60000000, trade)
        assert.strictEqual(candle.exchangeName, 'binance')
        assert.strictEqual(candle.symbol, symbol)
        assert.strictEqual(candle.id, 1)
        assert.strictEqual(candle.periodUs, 60000000)
        assert.deepStrictEqual(candle.trades, [trade])
        assert.strictEqual(candle.open, trade)
        assert.strictEqual(candle.close, trade)
        assert.strictEqual(candle.high, trade)
        assert.strictEqual(candle.low, trade)
        assert.deepStrictEqual(candle.volumes, { quote: 4200, base: 0.1 })
        assert.strictEqual(candle.prices.open, 42000)
        assert.strictEqual(candle.prices.close, 42000)
        assert.strictEqual(candle.prices.high, 42000)
        assert.strictEqual(candle.prices.low, 42000)
        assert.strictEqual(candle.tradeCount, 1)
    })

    it('should update with new trades and adjust OHLC and volumes', function () {
        const trade1 = makeTrade(1000000, 42000, 0.1, 4200, true)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        const trade2 = makeTrade(2000000, 43000, 0.2, 8600, false)
        candle.update(trade2)
        assert.strictEqual(candle.open, trade1)
        assert.strictEqual(candle.close, trade2)
        assert.strictEqual(candle.high, trade2)
        assert.strictEqual(candle.low, trade1)
        assert.deepStrictEqual(candle.volumes, { quote: 12800, base: 0.30000000000000004 })
        assert.strictEqual(candle.tradeCount, 2)
    })

    it('should update low if new trade has lower price', function () {
        const trade1 = makeTrade(1000000, 42000, 0.1, 4200, true)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        const trade2 = makeTrade(2000000, 41000, 0.2, 8200, false)
        candle.update(trade2)
        assert.strictEqual(candle.low, trade2)
        assert.strictEqual(candle.high, trade1)
    })

    it('should calculate direction correctly', function () {
        const trade1 = makeTrade(1000000, 42000)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        assert.strictEqual(candle.direction, 0)
        const trade2 = makeTrade(2000000, 43000)
        candle.update(trade2)
        assert.strictEqual(candle.direction, 1)
        const trade3 = makeTrade(3000000, 41000)
        candle.update(trade3)
        assert.strictEqual(candle.direction, -1)
    })

    it('should calculate height as abs(close - open)', function () {
        const trade1 = makeTrade(1000000, 42000)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        assert.strictEqual(candle.height, 0)
        const trade2 = makeTrade(2000000, 43000)
        candle.update(trade2)
        assert.strictEqual(candle.height, 1000)
    })

    it('should throw if updating with a trade of a different symbol', function () {
        const symbol1 = new Symbol('BTC', 'USDC')
        const symbol2 = new Symbol('ETH', 'USDC')
        const trade1 = new Trade('binance', symbol1, 'lid', 'rid', 'olid', 1000000, 42000, 0.1, 4200, true)
        const trade2 = new Trade('binance', symbol2, 'lid2', 'rid2', 'olid2', 2000000, 43000, 0.2, 8600, false)
        const candle = new Candle('binance', symbol1, 1, 60000000, trade1)
        assert.throws(() => candle.update(trade2), /does not match candle symbol/i)
    })

    it('should throw if updating with a trade that is backwards in time', function () {
        const symbol = new Symbol('BTC', 'USDC')
        const trade1 = new Trade('binance', symbol, 'lid', 'rid', 'olid', 2000000, 42000, 0.1, 4200, true)
        const trade2 = new Trade('binance', symbol, 'lid2', 'rid2', 'olid2', 1000000, 43000, 0.2, 8600, false)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        assert.throws(() => candle.update(trade2), /is earlier than last trade timestamp/i)
    })

    it('should assign open, close, high, and low to different trades when 4 trades with different prices are added', function () {
        const symbol = new Symbol('BTC', 'USDC')
        const trade1 = new Trade('binance', symbol, 'lid1', 'rid1', 'olid1', 1000000, 42000, 0.1, 4200, false)
        const trade2 = new Trade('binance', symbol, 'lid2', 'rid2', 'olid2', 2000000, 44000, 0.1, 4400, false)
        const trade3 = new Trade('binance', symbol, 'lid3', 'rid3', 'olid3', 3000000, 41000, 0.1, 4100, false)
        const trade4 = new Trade('binance', symbol, 'lid4', 'rid4', 'olid4', 4000000, 43000, 0.1, 4300, false)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        candle.update(trade2)
        candle.update(trade3)
        candle.update(trade4)
        assert.strictEqual(candle.open, trade1)
        assert.strictEqual(candle.close, trade4)
        assert.strictEqual(candle.high, trade2)
        assert.strictEqual(candle.low, trade3)
        assert.deepStrictEqual(candle.prices, {
            open: 42000,
            close: 43000,
            high: 44000,
            low: 41000
        })
        assert.deepStrictEqual(candle.tsUs, {
            candle: 60000000 * 1,
            open: 1000000,
            close: 4000000,
            high: 2000000,
            low: 3000000
        })
    })
})
