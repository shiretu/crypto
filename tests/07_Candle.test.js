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

    describe('fromOHLC', () => {
        it('should construct directly from OHLC trades', () => {
            const open = makeTrade(1000, 100)
            const high = makeTrade(2000, 120)
            const low = makeTrade(3000, 80)
            const close = makeTrade(4000, 110)
            const c = Candle.fromOHLC(60, open, high, low, close)
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
                makeTrade(135_000_000, 110))
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
        it('should have RECORD_SIZE of 64', () => {
            expect(CandleRef.RECORD_SIZE).to.equal(64)
        })
    })

    describe('writeRecord and read', () => {
        it('should round-trip a non-empty candle', () => {
            const open = makeTrade(1000, 100, 1, 100, false, 0, 0)
            const close = makeTrade(4000, 110, 1, 110, false, 3, 3)
            const high = makeTrade(2000, 120, 1, 120, false, 1, 1)
            const low = makeTrade(3000, 80, 1, 80, false, 2, 2)
            const c = Candle.fromOHLC(60, open, high, low, close)

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
        })

        it('should write an empty candle with openTsUs=0 and ordinal in openDayIndex', () => {
            const c = Candle.empty(60, 42)
            const buf = toCandleRefBuffer(c)
            const ref = new CandleRef(buf)
            expect(ref.openTsUs).to.equal(0)
            expect(ref.openDayIndex).to.equal(42)
            expect(ref.closeTsUs).to.equal(0)
            expect(ref.highTsUs).to.equal(0)
            expect(ref.lowTsUs).to.equal(0)
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

        it('should hydrate a non-empty candle', () => {
            const open = makeTrade(1000, 100, 1, 100, false, 0, 0)
            const close = makeTrade(4000, 110, 1, 110, false, 3, 3)
            const high = makeTrade(2000, 120, 1, 120, false, 1, 1)
            const low = makeTrade(3000, 80, 1, 80, false, 2, 2)
            const c = Candle.fromOHLC(60, open, high, low, close)
            const ref = new CandleRef(toCandleRefBuffer(c))
            const store = buildStore([open, close, high, low])

            const restored = fromCandleRef(ref, 60, store)
            expect(restored.isEmpty).to.equal(false)
            expect(restored.open.price).to.equal(100)
            expect(restored.close.price).to.equal(110)
            expect(restored.high.price).to.equal(120)
            expect(restored.low.price).to.equal(80)
        })

        it('should hydrate an empty candle without touching the store', () => {
            const c = Candle.empty(60, 7)
            const ref = new CandleRef(toCandleRefBuffer(c))
            const store = { getAt () { throw new Error('should not be called') } }

            const restored = fromCandleRef(ref, 60, store)
            expect(restored.isEmpty).to.equal(true)
            expect(restored.ordinal).to.equal(7)
        })
    })
})
