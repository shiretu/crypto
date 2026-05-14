import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import Candle, { CandleRef, toCandleRefBuffer, fromCandleRef } from '../src/core/Candle.js'
import CandleDuration from '../src/core/CandleDuration.js'

// Helper to construct a Trade from a literal object
const makeTrade = (tsUs, price, baseQty = 1, quoteQty = price, isBuyerMaker = false, dayIndex = 0, absoluteIndex = 0) => {
    const buf = Buffer.alloc(Trade.RECORD_SIZE)
    Trade.writeRecord(buf, 0, tsUs, price, baseQty, quoteQty, isBuyerMaker)
    return new Trade(buf, dayIndex, absoluteIndex)
}

describe('Candle', () => {
    describe('constructor validation', () => {
        it('should reject invalid duration', () => {
            expect(() => new Candle(7, makeTrade(1000, 100))).to.throw('Invalid candle duration')
        })

        it('should accept all valid durations', () => {
            for (const d of Object.values(CandleDuration)) {
                expect(() => new Candle(d, makeTrade(1000, 100))).to.not.throw()
            }
        })

        it('should reject non-Trade firstTrade', () => {
            expect(() => new Candle(60, { tsUs: 1000, price: 100 })).to.throw('firstTrade must be a Trade')
        })
    })

    describe('first-trade initialization', () => {
        it('should set open/close/high/low to the first trade', () => {
            const t = makeTrade(1_000_000, 100)
            const c = new Candle(60, t)
            expect(c.open).to.equal(t)
            expect(c.close).to.equal(t)
            expect(c.high).to.equal(t)
            expect(c.low).to.equal(t)
        })

        it('should expose durationSec', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            expect(c.durationSec).to.equal(60)
        })

        it('should compute ordinal as floor(tsUs / (duration * 1e6))', () => {
            // 60 seconds = 60_000_000 us, trade at tsUs = 125_000_000 → ordinal 2
            const c = new Candle(60, makeTrade(125_000_000, 100))
            expect(c.ordinal).to.equal(2)
        })

        it('should compute ordinal 0 for early trade', () => {
            const c = new Candle(60, makeTrade(1_000_000, 100))
            expect(c.ordinal).to.equal(0)
        })

        it('should be non-empty after init', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            expect(c.isEmpty).to.equal(false)
        })
    })

    describe('empty candle', () => {
        it('should create an empty candle with given ordinal', () => {
            const c = Candle.empty(60, 42)
            expect(c.isEmpty).to.equal(true)
            expect(c.ordinal).to.equal(42)
            expect(c.durationSec).to.equal(60)
        })

        it('should have null open/close/high/low', () => {
            const c = Candle.empty(60, 0)
            expect(c.open).to.be.null
            expect(c.close).to.be.null
            expect(c.high).to.be.null
            expect(c.low).to.be.null
        })

        it('should reject invalid duration', () => {
            expect(() => Candle.empty(7, 0)).to.throw('Invalid candle duration')
        })
    })

    describe('update', () => {
        it('should update close on later trade', () => {
            const t0 = makeTrade(1000, 100)
            const t1 = makeTrade(2000, 110)
            const c = new Candle(60, t0)
            c.update(t1)
            expect(c.close).to.equal(t1)
        })

        it('should track new high', () => {
            const t0 = makeTrade(1000, 100)
            const t1 = makeTrade(2000, 200)
            const c = new Candle(60, t0)
            c.update(t1)
            expect(c.high).to.equal(t1)
            expect(c.low).to.equal(t0)
        })

        it('should track new low', () => {
            const t0 = makeTrade(1000, 100)
            const t1 = makeTrade(2000, 50)
            const c = new Candle(60, t0)
            c.update(t1)
            expect(c.low).to.equal(t1)
            expect(c.high).to.equal(t0)
        })

        it('should not update high/low when price stays the same', () => {
            const t0 = makeTrade(1000, 100)
            const t1 = makeTrade(2000, 100)
            const c = new Candle(60, t0)
            c.update(t1)
            expect(c.high).to.equal(t0)
            expect(c.low).to.equal(t0)
            expect(c.close).to.equal(t1)
        })

        it('should allow trade at exactly the same tsUs as close', () => {
            const t0 = makeTrade(1000, 100)
            const t1 = makeTrade(1000, 110)
            const c = new Candle(60, t0)
            expect(() => c.update(t1)).to.not.throw()
            expect(c.close).to.equal(t1)
        })

        it('should reject earlier tsUs than close', () => {
            const t0 = makeTrade(2000, 100)
            const t1 = makeTrade(1000, 110)
            const c = new Candle(60, t0)
            expect(() => c.update(t1)).to.throw('earlier than last trade')
        })

        it('should reject non-Trade', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            expect(() => c.update({ tsUs: 2000, price: 110 })).to.throw('trade must be a Trade')
        })

        it('should track multiple high updates', () => {
            const trades = [
                makeTrade(1000, 100),
                makeTrade(2000, 110),
                makeTrade(3000, 105),
                makeTrade(4000, 120),
                makeTrade(5000, 115)
            ]
            const c = new Candle(60, trades[0])
            for (let i = 1; i < trades.length; i++) c.update(trades[i])
            expect(c.open).to.equal(trades[0])
            expect(c.high).to.equal(trades[3])
            expect(c.low).to.equal(trades[0])
            expect(c.close).to.equal(trades[4])
        })

        it('should track high/low across many trades', () => {
            const trades = [
                makeTrade(1000, 100),
                makeTrade(2000, 95),
                makeTrade(3000, 105),
                makeTrade(4000, 90),
                makeTrade(5000, 110)
            ]
            const c = new Candle(60, trades[0])
            for (let i = 1; i < trades.length; i++) c.update(trades[i])
            expect(c.low).to.equal(trades[3])
            expect(c.high).to.equal(trades[4])
        })
    })

    describe('volume aggregates', () => {
        it('should initialise from the first trade (taker-buy)', () => {
            // isBuyerMaker=false => taker is the buyer
            const t = makeTrade(1000, 100, /* baseQty */ 0.5, /* quoteQty */ 50, /* isBuyerMaker */ false)
            const c = new Candle(60, t)
            expect(c.baseVolume).to.equal(0.5)
            expect(c.quoteVolume).to.equal(50)
            expect(c.takerBuyBaseVolume).to.equal(0.5)
            expect(c.tradeCount).to.equal(1)
        })

        it('should initialise from the first trade (taker-sell -> zero taker-buy)', () => {
            // isBuyerMaker=true => taker is the seller, so taker-buy share is 0
            const t = makeTrade(1000, 100, 0.5, 50, true)
            const c = new Candle(60, t)
            expect(c.baseVolume).to.equal(0.5)
            expect(c.quoteVolume).to.equal(50)
            expect(c.takerBuyBaseVolume).to.equal(0)
            expect(c.tradeCount).to.equal(1)
        })

        it('should accumulate base/quote volumes and trade count across updates', () => {
            // dayIndex 0, 1, 2 -> derived tradeCount = closeDayIndex - openDayIndex + 1 = 3
            const c = new Candle(60, makeTrade(1000, 100, 0.5, 50, false, 0))
            c.update(makeTrade(2000, 110, 0.25, 27.5, false, 1))
            c.update(makeTrade(3000, 105, 0.1, 10.5, true, 2)) // taker-sell
            expect(c.baseVolume).to.be.closeTo(0.85, 1e-12)
            expect(c.quoteVolume).to.be.closeTo(88, 1e-12)
            // taker-buy: only first two trades count
            expect(c.takerBuyBaseVolume).to.be.closeTo(0.75, 1e-12)
            expect(c.tradeCount).to.equal(3)
        })

        it('should expose zero aggregates on an empty candle', () => {
            const c = Candle.empty(60, 42)
            expect(c.baseVolume).to.equal(0)
            expect(c.quoteVolume).to.equal(0)
            expect(c.takerBuyBaseVolume).to.equal(0)
            expect(c.tradeCount).to.equal(0)
        })
    })

    describe('fromOHLC', () => {
        it('should construct directly from OHLC trades', () => {
            const open = makeTrade(1000, 100)
            const high = makeTrade(2000, 120)
            const low = makeTrade(3000, 80)
            const close = makeTrade(4000, 110)
            const c = Candle.fromOHLC(60, open, high, low, close, 0, 0, 0)
            expect(c.open).to.equal(open)
            expect(c.high).to.equal(high)
            expect(c.low).to.equal(low)
            expect(c.close).to.equal(close)
            expect(c.isEmpty).to.equal(false)
        })

        it('should set ordinal from open trade', () => {
            const open = makeTrade(125_000_000, 100)
            const c = Candle.fromOHLC(60,
                open,
                makeTrade(130_000_000, 120),
                makeTrade(126_000_000, 80),
                makeTrade(135_000_000, 110),
                0, 0, 0)
            expect(c.ordinal).to.equal(2)
        })
    })

    describe('containsPrices', () => {
        it('should return false for empty candle', () => {
            const c = Candle.empty(60, 0)
            expect(c.containsPrices(50, 150)).to.equal(false)
        })

        it('should return true when low dips below threshold', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            c.update(makeTrade(2000, 50))
            expect(c.containsPrices(60, 200)).to.equal(true)
        })

        it('should return true when high crosses over threshold', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            c.update(makeTrade(2000, 200))
            expect(c.containsPrices(50, 150)).to.equal(true)
        })

        it('should return false when range is fully contained between thresholds', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            c.update(makeTrade(2000, 110))
            expect(c.containsPrices(50, 200)).to.equal(false)
        })

        it('should return true at exact equality with dipsBelow', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            c.update(makeTrade(2000, 50))
            expect(c.containsPrices(50, 200)).to.equal(true)
        })

        it('should return true at exact equality with crossesOver', () => {
            const c = new Candle(60, makeTrade(1000, 100))
            c.update(makeTrade(2000, 200))
            expect(c.containsPrices(50, 200)).to.equal(true)
        })
    })
})

describe('CandleRef', () => {
    describe('static layout', () => {
        it('should have RECORD_SIZE of 88', () => {
            expect(CandleRef.RECORD_SIZE).to.equal(88)
        })
    })

    describe('writeRecord and read', () => {
        it('should round-trip a non-empty candle (incl. volume aggregates)', () => {
            // Build through normal update path so the volume aggregates are real
            const open = makeTrade(1000, 100, 0.5, 50, false, 0, 0)
            const tHigh = makeTrade(2000, 120, 0.25, 30, true, 1, 1)
            const tLow = makeTrade(3000, 80, 0.1, 8, false, 2, 2)
            const close = makeTrade(4000, 110, 0.2, 22, false, 3, 3)
            const c = new Candle(60, open)
            c.update(tHigh)
            c.update(tLow)
            c.update(close)

            const buf = toCandleRefBuffer(c)
            expect(buf.length).to.equal(CandleRef.RECORD_SIZE)

            const ref = new CandleRef(buf)
            expect(ref.openTsUs).to.equal(1000)
            expect(ref.openDayIndex).to.equal(0)
            expect(ref.closeTsUs).to.equal(4000)
            expect(ref.closeDayIndex).to.equal(3)
            expect(ref.highTsUs).to.equal(2000)
            expect(ref.highDayIndex).to.equal(1)
            expect(ref.lowTsUs).to.equal(3000)
            expect(ref.lowDayIndex).to.equal(2)
            // 0.5 + 0.25 + 0.1 + 0.2 = 1.05
            expect(ref.baseVolume).to.be.closeTo(1.05, 1e-12)
            // 50 + 30 + 8 + 22 = 110
            expect(ref.quoteVolume).to.be.closeTo(110, 1e-12)
            // taker-buy: trades 0, 2, 3 (isBuyerMaker=false) = 0.5 + 0.1 + 0.2 = 0.8
            expect(ref.takerBuyBaseVolume).to.be.closeTo(0.8, 1e-12)
            expect(ref.tradeCount).to.equal(4)
        })

        it('should write an empty candle with openTsUs=0, ordinal in openDayIndex, and zero volumes', () => {
            const c = Candle.empty(60, 42)
            const buf = toCandleRefBuffer(c)
            const ref = new CandleRef(buf)
            expect(ref.openTsUs).to.equal(0)
            expect(ref.openDayIndex).to.equal(42)
            expect(ref.closeTsUs).to.equal(0)
            expect(ref.highTsUs).to.equal(0)
            expect(ref.lowTsUs).to.equal(0)
            expect(ref.baseVolume).to.equal(0)
            expect(ref.quoteVolume).to.equal(0)
            expect(ref.takerBuyBaseVolume).to.equal(0)
            expect(ref.tradeCount).to.equal(0)
        })
    })

    describe('fromCandleRef', () => {
        // Minimal trades store with getAt(tsUs, dayIndex)
        const buildStore = (trades) => ({
            getAt (tsUs, dayIndex) {
                const t = trades.find(x => x.tsUs === tsUs && x.dayIndex === dayIndex)
                if (!t) throw new Error(`Trade not found ${tsUs}/${dayIndex}`)
                return t
            }
        })

        it('should hydrate a non-empty candle (including volume aggregates)', () => {
            const open = makeTrade(1000, 100, 0.5, 50, false, 0, 0)
            const tHigh = makeTrade(2000, 120, 0.25, 30, true, 1, 1)
            const tLow = makeTrade(3000, 80, 0.1, 8, false, 2, 2)
            const close = makeTrade(4000, 110, 0.2, 22, false, 3, 3)
            const c = new Candle(60, open)
            c.update(tHigh)
            c.update(tLow)
            c.update(close)
            const ref = new CandleRef(toCandleRefBuffer(c))
            const store = buildStore([open, close, tHigh, tLow])

            const restored = fromCandleRef(ref, 60, store)
            expect(restored.isEmpty).to.equal(false)
            expect(restored.open.price).to.equal(100)
            expect(restored.close.price).to.equal(110)
            expect(restored.high.price).to.equal(120)
            expect(restored.low.price).to.equal(80)
            expect(restored.baseVolume).to.be.closeTo(1.05, 1e-12)
            expect(restored.quoteVolume).to.be.closeTo(110, 1e-12)
            expect(restored.takerBuyBaseVolume).to.be.closeTo(0.8, 1e-12)
            expect(restored.tradeCount).to.equal(4)
        })

        it('should hydrate an empty candle without touching the store', () => {
            const c = Candle.empty(60, 7)
            const ref = new CandleRef(toCandleRefBuffer(c))
            const store = { getAt () { throw new Error('should not be called') } }

            const restored = fromCandleRef(ref, 60, store)
            expect(restored.isEmpty).to.equal(true)
            expect(restored.ordinal).to.equal(7)
            expect(restored.baseVolume).to.equal(0)
            expect(restored.quoteVolume).to.equal(0)
            expect(restored.takerBuyBaseVolume).to.equal(0)
            expect(restored.tradeCount).to.equal(0)
        })
    })
})
