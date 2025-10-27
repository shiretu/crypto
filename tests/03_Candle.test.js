/* eslint-env mocha */
const assert = require('assert')
const Symbol = require('../src/core/Symbol')
const Trade = require('../src/core/Trade')
const Candle = require('../src/core/Candle')

describe('Candle', () => {
    const symbol = new Symbol('BTC', 'USDC')
    function makeTrade (tsUs, price, baseQty = 1, quoteQty = 100, isBuyerMaker = false) {
        return new Trade('binance', symbol, 'lid', 'rid', 'olid', tsUs, price, baseQty, quoteQty, isBuyerMaker)
    }

    it('should construct with correct initial values', () => {
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

    it('should update with new trades and adjust OHLC and volumes', () => {
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

    it('should update low if new trade has lower price', () => {
        const trade1 = makeTrade(1000000, 42000, 0.1, 4200, true)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        const trade2 = makeTrade(2000000, 41000, 0.2, 8200, false)
        candle.update(trade2)
        assert.strictEqual(candle.low, trade2)
        assert.strictEqual(candle.high, trade1)
    })

    it('should calculate direction correctly', () => {
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

    it('should calculate height as abs(close - open)', () => {
        const trade1 = makeTrade(1000000, 42000)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        assert.strictEqual(candle.height, 0)
        const trade2 = makeTrade(2000000, 43000)
        candle.update(trade2)
        assert.strictEqual(candle.height, 1000)
    })

    it('should throw if updating with a trade of a different symbol', () => {
        const symbol1 = new Symbol('BTC', 'USDC')
        const symbol2 = new Symbol('ETH', 'USDC')
        const trade1 = new Trade('binance', symbol1, 'lid', 'rid', 'olid', 1000000, 42000, 0.1, 4200, true)
        const trade2 = new Trade('binance', symbol2, 'lid2', 'rid2', 'olid2', 2000000, 43000, 0.2, 8600, false)
        const candle = new Candle('binance', symbol1, 1, 60000000, trade1)
        assert.throws(() => candle.update(trade2), /does not match candle symbol/i)
    })

    it('should throw if updating with a trade that is backwards in time', () => {
        const symbol = new Symbol('BTC', 'USDC')
        const trade1 = new Trade('binance', symbol, 'lid', 'rid', 'olid', 2000000, 42000, 0.1, 4200, true)
        const trade2 = new Trade('binance', symbol, 'lid2', 'rid2', 'olid2', 1000000, 43000, 0.2, 8600, false)
        const candle = new Candle('binance', symbol, 1, 60000000, trade1)
        assert.throws(() => candle.update(trade2), /is earlier than last trade timestamp/i)
    })

    it('should assign open, close, high, and low to different trades when 4 trades with different prices are added', () => {
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

    it('should normalize price, volume, height, trade count, and minute of day', () => {
        const symbol = new Symbol('BTC', 'USDC')
        // Create 3 candles with increasing values
        const t0 = 24 * 3600 * 1_000_000 // midnight day 1
        const periodUs = 60 * 1_000_000 // 1 minute
        // Candle 1: low values
        const trade1 = new Trade('binance', symbol, 'lid1', 'rid1', 'olid1', t0, 100, 1, 10, false)
        const c1 = new Candle('binance', symbol, 0, periodUs, trade1)
        // Candle 2: mid values
        const trade2 = new Trade('binance', symbol, 'lid2', 'rid2', 'olid2', t0 + periodUs, 200, 2, 20, false)
        const c2 = new Candle('binance', symbol, 1, periodUs, trade2)
        c2.update(new Trade('binance', symbol, 'lid2b', 'rid2b', 'olid2b', t0 + periodUs + 1, 250, 1, 5, false))
        // Candle 3: high values
        const trade3 = new Trade('binance', symbol, 'lid3', 'rid3', 'olid3', t0 + 2 * periodUs, 300, 3, 30, false)
        const c3 = new Candle('binance', symbol, 2, periodUs, trade3)
        c3.update(new Trade('binance', symbol, 'lid3b', 'rid3b', 'olid3b', t0 + 2 * periodUs + 1, 350, 2, 10, false))
        c3.update(new Trade('binance', symbol, 'lid3c', 'rid3c', 'olid3c', t0 + 2 * periodUs + 2, 400, 1, 5, false))
        // Normalize
        Candle.normalize([c1, c2, c3])
        // Check normalized price for lowest and highest trade
        const allTrades = [trade1, trade2, ...c2.trades.slice(1), trade3, ...c3.trades.slice(1)]
        const minPrice = 100; const maxPrice = 400
        allTrades.forEach(trade => {
            const expected = (trade.price - minPrice) / (maxPrice - minPrice)
            assert(Math.abs(trade.normalizedPrice - expected) < 1e-8)
        })
        // Check normalized volumes
        assert(Math.abs(c1.normalizedQuoteVolume - 0) < 1e-8)
        assert(Math.abs(c3.normalizedQuoteVolume - 1) < 1e-8)
        // Check normalized height
        assert(Math.abs(c1.normalizedHeight - 0) < 1e-8)
        assert(Math.abs(c3.normalizedHeight - 1) < 1e-8)
        // Check normalized trade count
        assert(Math.abs(c1.normalizedTradesCount - 0) < 1e-8)
        assert(Math.abs(c3.normalizedTradesCount - 1) < 1e-8)
        // Check normalized minute of day (should be 0, 1, 2 for c1, c2, c3)
        assert(Math.abs(c1.normalizedMinuteOfDay - 0) < 1e-8)
        assert(Math.abs(c2.normalizedMinuteOfDay - 1) < 1e-8)
        assert(Math.abs(c3.normalizedMinuteOfDay - 2) < 1e-8)
    })

    it('should normalize minute of day correctly for candles before and after midnight', () => {
        const symbol = new Symbol('BTC', 'USDC')
        const periodUs = 60 * 1_000_000 // 1 minute
        // Day boundaries
        const dayUs = 24 * 3600 * 1_000_000
        // Candle before midnight on day 1 (day 1, 23:59)
        const tradeBefore = new Trade('binance', symbol, 'lidB', 'ridB', 'olidB', dayUs - periodUs, 100, 1, 10, false)
        const cBefore = new Candle('binance', symbol, 0, periodUs, tradeBefore)
        // Candle at midnight on day 2 (day 2, 00:00)
        const tradeAt = new Trade('binance', symbol, 'lidA', 'ridA', 'olidA', dayUs, 200, 2, 20, false)
        const cAt = new Candle('binance', symbol, 1, periodUs, tradeAt)
        // Candle after midnight on day 3 (day 3, 00:01)
        const tradeAfter = new Trade('binance', symbol, 'lidAf', 'ridAf', 'olidAf', 2 * dayUs + periodUs, 300, 3, 30, false)
        const cAfter = new Candle('binance', symbol, 2, periodUs, tradeAfter)
        // Normalize
        Candle.normalize([cBefore, cAt, cAfter])
        // The last candle is after midnight on day 3, so midnight is at 2*dayUs
        // cBefore: (dayUs - periodUs - 2*dayUs) / (60*1_000_000) = (-dayUs - periodUs) / 60_000_000 = -1440 - 1
        // cAt: (dayUs - 2*dayUs) / (60*1_000_000) = -1440
        // cAfter: (2*dayUs + periodUs - 2*dayUs) / (60*1_000_000) = 1
        assert(Math.abs(cBefore.normalizedMinuteOfDay - (-1441)) < 1e-8)
        assert(Math.abs(cAt.normalizedMinuteOfDay - (-1440)) < 1e-8)
        assert(Math.abs(cAfter.normalizedMinuteOfDay - 1) < 1e-8)
    })
})
