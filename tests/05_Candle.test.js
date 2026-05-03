import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import Candle from '../src/core/Candle.js'
import CandleDuration from '../src/core/candleDuration.js'
import { binance } from '../src/exchanges/binance.js'

describe('Candle', () => {
    const sym = binance.getSymbol('btc:usdc')
    const periodSec = CandleDuration.MIN_1

    const makeTrade = (tsUs, price, baseQty = 0.1, quoteQty = 100) => {
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, tsUs, price, baseQty, quoteQty, false)
        return Trade.fromBuffer(sym, 0, buf, 0)
    }

    it('should create from a single trade', () => {
        const trade = makeTrade(1000000, 42000)
        const candle = new Candle(periodSec, trade)

        expect(candle.open).to.equal(trade)
        expect(candle.close).to.equal(trade)
        expect(candle.high).to.equal(trade)
        expect(candle.low).to.equal(trade)
        expect(candle.targetDurationSec).to.equal(periodSec)
    })

    it('should compute index as epoch-aligned time bucket', () => {
        // 2024-01-01 07:30:00 UTC = 1704094200 seconds
        const tsUs = 1704094200_000000
        const trade = makeTrade(tsUs, 42000)

        // 1-hour candles
        const hourCandle = new Candle(3600, trade)
        const expectedIndex = Math.floor(tsUs / (3600 * 1_000_000))
        expect(hourCandle.index).to.equal(expectedIndex)
        // index * 3600 seconds from epoch = 07:00 UTC
        expect(hourCandle.index * 3600).to.equal(1704092400)

        // id includes symbol, duration, and index
        expect(hourCandle.id).to.equal(`binance:btc:usdc:3600:${expectedIndex}`)

        // 1-minute candles
        const minCandle = new Candle(60, trade)
        expect(minCandle.index).to.equal(Math.floor(tsUs / (60 * 1_000_000)))
    })

    it('should update OHLC correctly', () => {
        const t1 = makeTrade(1000000, 42000)
        const t2 = makeTrade(2000000, 42500) // new high
        const t3 = makeTrade(3000000, 41800) // new low
        const t4 = makeTrade(4000000, 42200) // close

        const candle = new Candle(periodSec, t1)
        candle.update(t2)
        candle.update(t3)
        candle.update(t4)

        expect(candle.open).to.equal(t1)
        expect(candle.close).to.equal(t4)
        expect(candle.high).to.equal(t2)
        expect(candle.low).to.equal(t3)
    })

    it('should reject out-of-order trades', () => {
        const t1 = makeTrade(2000000, 100)
        const t2 = makeTrade(1000000, 100)
        const candle = new Candle(periodSec, t1)
        expect(() => candle.update(t2)).to.throw()
    })

    it('should create from trades array', () => {
        const trades = [
            makeTrade(1000000, 100),
            makeTrade(2000000, 105),
            makeTrade(3000000, 98)
        ]
        const candle = Candle.fromTrades(periodSec, trades)

        expect(candle.open).to.equal(trades[0])
        expect(candle.close).to.equal(trades[2])
    })

    it('should throw on empty trades array', () => {
        expect(() => Candle.fromTrades(periodSec, [])).to.throw()
    })

    it('should reject invalid duration', () => {
        const trade = makeTrade(1000000, 42000)
        expect(() => new Candle(47, trade)).to.throw()
        expect(() => new Candle(0, trade)).to.throw()
        expect(() => new Candle(100, trade)).to.throw()
    })
})
