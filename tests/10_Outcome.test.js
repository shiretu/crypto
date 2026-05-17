import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import Outcome, { OutcomeRef, fromOutcomeRef } from '../src/core/Outcome.js'
import { LongOrder, ShortOrder } from '../src/core/Order.js'

const makeTrade = (tsUs, price, dayIndex = 0, absoluteIndex = 0) => {
    const buf = Buffer.alloc(Trade.RECORD_SIZE)
    Trade.writeRecord(buf, 0, tsUs, price, 1, price, false)
    return new Trade(buf, dayIndex, absoluteIndex)
}

describe('Outcome', () => {
    describe('constructor validation', () => {
        it('should reject zero tpPercent', () => {
            expect(() => new Outcome(0, 1, makeTrade(1000, 100))).to.throw('tpPercent must be positive')
        })

        it('should reject negative tpPercent', () => {
            expect(() => new Outcome(-1, 1, makeTrade(1000, 100))).to.throw('tpPercent must be positive')
        })

        it('should reject zero slPercent', () => {
            expect(() => new Outcome(1, 0, makeTrade(1000, 100))).to.throw('slPercent must be positive')
        })

        it('should reject negative slPercent', () => {
            expect(() => new Outcome(1, -1, makeTrade(1000, 100))).to.throw('slPercent must be positive')
        })

        it('should accept positive tp and sl', () => {
            expect(() => new Outcome(1.5, 1, makeTrade(1000, 100))).to.not.throw()
        })
    })

    describe('initial state', () => {
        const open = makeTrade(1000, 100)
        const o = new Outcome(1.5, 1, open)

        it('should expose openTrade', () => {
            expect(o.openTrade).to.equal(open)
        })

        it('should not be completed', () => {
            expect(o.completed).to.equal(false)
        })

        it('should have null longTrade and shortTrade', () => {
            expect(o.longTrade).to.equal(null)
            expect(o.shortTrade).to.equal(null)
        })

        it('should have null longOrder and shortOrder', () => {
            expect(o.longOrder).to.equal(null)
            expect(o.shortOrder).to.equal(null)
        })
    })

    describe('limits', () => {
        it('should compute long TP/SL relative to open price', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            expect(o.limits.long.tp).to.be.closeTo(101.5, 1e-9)
            expect(o.limits.long.sl).to.be.closeTo(99, 1e-9)
        })

        it('should compute short TP/SL relative to open price (mirrored)', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            expect(o.limits.short.tp).to.be.closeTo(98.5, 1e-9)
            expect(o.limits.short.sl).to.be.closeTo(101, 1e-9)
        })

        it('should cache limits across calls', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            expect(o.limits).to.equal(o.limits)
        })

        it('should recompute limits after reset', () => {
            const o = new Outcome(2, 1, makeTrade(1000, 100))
            const before = o.limits
            o.reset(makeTrade(2000, 200))
            expect(o.limits).to.not.equal(before)
            expect(o.limits.long.tp).to.be.closeTo(204, 1e-9)
        })
    })

    describe('update — long side', () => {
        it('should not update before/at open tsUs', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            o.update(makeTrade(500, 200))
            expect(o.longTrade).to.equal(null)
            o.update(makeTrade(1000, 200))
            expect(o.longTrade).to.equal(null)
        })

        it('should set longTrade when price reaches TP', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const tp = makeTrade(2000, 101.5)
            o.update(tp)
            expect(o.longTrade).to.equal(tp)
        })

        it('should set longTrade when price exceeds TP', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const tp = makeTrade(2000, 102)
            o.update(tp)
            expect(o.longTrade).to.equal(tp)
        })

        it('should set longTrade when price reaches SL', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const sl = makeTrade(2000, 99)
            o.update(sl)
            expect(o.longTrade).to.equal(sl)
        })

        it('should set longTrade when price falls below SL', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const sl = makeTrade(2000, 98)
            o.update(sl)
            expect(o.longTrade).to.equal(sl)
        })

        it('should not change longTrade after it is set', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const tp = makeTrade(2000, 102)
            o.update(tp)
            o.update(makeTrade(3000, 105))
            expect(o.longTrade).to.equal(tp)
        })
    })

    describe('update — short side', () => {
        it('should set shortTrade when price reaches short TP', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const tp = makeTrade(2000, 98.5)
            o.update(tp)
            expect(o.shortTrade).to.equal(tp)
        })

        it('should set shortTrade when price falls below short TP', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const tp = makeTrade(2000, 97)
            o.update(tp)
            expect(o.shortTrade).to.equal(tp)
        })

        it('should set shortTrade when price reaches short SL', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const sl = makeTrade(2000, 101)
            o.update(sl)
            expect(o.shortTrade).to.equal(sl)
        })

        it('should set shortTrade when price rises above short SL', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const sl = makeTrade(2000, 102)
            o.update(sl)
            expect(o.shortTrade).to.equal(sl)
        })

        it('should not change shortTrade after it is set', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const sl = makeTrade(2000, 101)
            o.update(sl)
            o.update(makeTrade(3000, 110))
            expect(o.shortTrade).to.equal(sl)
        })
    })

    describe('completion', () => {
        it('should be completed once both long and short are set', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            o.update(makeTrade(2000, 102)) // sets long (>= long TP) AND short (>= short SL=101)
            expect(o.completed).to.equal(true)
            expect(o.longTrade).to.not.be.null
            expect(o.shortTrade).to.not.be.null
        })

        it('should remain incomplete when only one side hits', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            o.update(makeTrade(2000, 100.5)) // strictly inside both bands
            expect(o.completed).to.equal(false)
        })

        it('should be completed when long hits then later short hits', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            // Long SL at 99
            o.update(makeTrade(2000, 99))
            expect(o.completed).to.equal(false)
            expect(o.longTrade).to.not.be.null
            // Short SL at 101
            o.update(makeTrade(3000, 101))
            expect(o.completed).to.equal(true)
            expect(o.shortTrade).to.not.be.null
        })

        it('should return early from update once completed', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            o.update(makeTrade(2000, 102))
            expect(o.completed).to.equal(true)
            const longBefore = o.longTrade
            const shortBefore = o.shortTrade
            o.update(makeTrade(3000, 200))
            expect(o.longTrade).to.equal(longBefore)
            expect(o.shortTrade).to.equal(shortBefore)
        })
    })

    describe('longOrder and shortOrder', () => {
        it('should expose LongOrder once long completes', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            o.update(makeTrade(2000, 102))
            expect(o.longOrder).to.be.instanceOf(LongOrder)
            expect(o.longOrder.open).to.equal(o.openTrade)
            expect(o.longOrder.close).to.equal(o.longTrade)
        })

        it('should expose ShortOrder once short completes', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            o.update(makeTrade(2000, 102))
            expect(o.shortOrder).to.be.instanceOf(ShortOrder)
            expect(o.shortOrder.open).to.equal(o.openTrade)
            expect(o.shortOrder.close).to.equal(o.shortTrade)
        })
    })

    describe('multiUpdate', () => {
        it('should walk trades until completion and return true', () => {
            const open = makeTrade(1000, 100)
            const trades = [
                makeTrade(1500, 100.5),
                makeTrade(2000, 101), // short SL hit
                makeTrade(3000, 102), // long TP hit → completes
                makeTrade(4000, 200) // should not be processed
            ]
            const o = new Outcome(1.5, 1, open)
            const done = o.multiUpdate(trades)
            expect(done).to.equal(true)
            expect(o.longTrade).to.equal(trades[2])
            expect(o.shortTrade).to.equal(trades[1])
        })

        it('should return false if not completed at the end', () => {
            const open = makeTrade(1000, 100)
            const trades = [makeTrade(2000, 100.2), makeTrade(3000, 100.5)]
            const o = new Outcome(1.5, 1, open)
            const done = o.multiUpdate(trades)
            expect(done).to.equal(false)
        })

        it('should honor start parameter', () => {
            const open = makeTrade(1000, 100)
            const trades = [
                makeTrade(2000, 102), // would complete both, but skipped
                makeTrade(3000, 100.5),
                makeTrade(4000, 100.6)
            ]
            const o = new Outcome(1.5, 1, open)
            o.multiUpdate(trades, 1)
            expect(o.longTrade).to.equal(null)
            expect(o.shortTrade).to.equal(null)
        })

        it('should honor end parameter', () => {
            const open = makeTrade(1000, 100)
            const trades = [
                makeTrade(2000, 100.2),
                makeTrade(3000, 100.5),
                makeTrade(4000, 102) // would complete both, but excluded
            ]
            const o = new Outcome(1.5, 1, open)
            o.multiUpdate(trades, 0, 2)
            expect(o.longTrade).to.equal(null)
            expect(o.shortTrade).to.equal(null)
        })
    })

    describe('reset', () => {
        it('should clear long/short trades', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            o.update(makeTrade(2000, 102))
            o.reset(makeTrade(3000, 200))
            expect(o.longTrade).to.equal(null)
            expect(o.shortTrade).to.equal(null)
            expect(o.completed).to.equal(false)
        })

        it('should replace openTrade', () => {
            const o = new Outcome(1.5, 1, makeTrade(1000, 100))
            const newOpen = makeTrade(2000, 200)
            o.reset(newOpen)
            expect(o.openTrade).to.equal(newOpen)
        })
    })

    describe('fromTrades', () => {
        it('should construct a completed outcome', () => {
            const open = makeTrade(1000, 100)
            const long = makeTrade(2000, 102)
            const short = makeTrade(2500, 101)
            const o = Outcome.fromTrades(1.5, 1, open, long, short)
            expect(o.openTrade).to.equal(open)
            expect(o.longTrade).to.equal(long)
            expect(o.shortTrade).to.equal(short)
            expect(o.completed).to.equal(true)
        })
    })
})

describe('OutcomeRef', () => {
    describe('static layout', () => {
        it('should have RECORD_SIZE of 48', () => {
            expect(OutcomeRef.RECORD_SIZE).to.equal(48)
        })
    })

    describe('writeRecord and read', () => {
        it('should round-trip outcome timestamps and indices', () => {
            const open = makeTrade(1_000_000, 100, 0, 100)
            const long = makeTrade(2_000_000, 102, 1, 101)
            const short = makeTrade(1_500_000, 101, 2, 102)
            const o = Outcome.fromTrades(1.5, 1, open, long, short)

            const buf = Buffer.alloc(OutcomeRef.RECORD_SIZE)
            OutcomeRef.writeRecord(buf, 0, o)

            const ref = new OutcomeRef(buf)
            expect(ref.openTsUs).to.equal(1_000_000)
            expect(ref.openDayIndex).to.equal(0)
            expect(ref.longTsUs).to.equal(2_000_000)
            expect(ref.longDayIndex).to.equal(1)
            expect(ref.shortTsUs).to.equal(1_500_000)
            expect(ref.shortDayIndex).to.equal(2)
        })

        it('should write at a non-zero offset', () => {
            const open = makeTrade(1_000_000, 100, 0, 0)
            const long = makeTrade(2_000_000, 102, 1, 1)
            const short = makeTrade(1_500_000, 101, 2, 2)
            const o = Outcome.fromTrades(1.5, 1, open, long, short)

            const buf = Buffer.alloc(OutcomeRef.RECORD_SIZE * 2)
            OutcomeRef.writeRecord(buf, OutcomeRef.RECORD_SIZE, o)
            const ref = new OutcomeRef(buf.subarray(OutcomeRef.RECORD_SIZE))
            expect(ref.openTsUs).to.equal(1_000_000)
            expect(ref.longTsUs).to.equal(2_000_000)
            expect(ref.shortTsUs).to.equal(1_500_000)
        })
    })

    describe('fromOutcomeRef', () => {
        const buildStore = (trades) => ({
            getAt (tsUs, dayIndex) {
                const t = trades.find(x => x.tsUs === tsUs && x.dayIndex === dayIndex)
                if (!t) throw new Error(`Trade not found ${tsUs}/${dayIndex}`)
                return t
            }
        })

        it('should hydrate an Outcome from a ref', () => {
            const open = makeTrade(1_000_000, 100, 0, 0)
            const long = makeTrade(2_000_000, 102, 1, 1)
            const short = makeTrade(1_500_000, 101, 2, 2)
            const o = Outcome.fromTrades(1.5, 1, open, long, short)

            const buf = Buffer.alloc(OutcomeRef.RECORD_SIZE)
            OutcomeRef.writeRecord(buf, 0, o)
            const ref = new OutcomeRef(buf)

            const restored = fromOutcomeRef(ref, 1.5, 1, buildStore([open, long, short]))
            expect(restored.openTrade.price).to.equal(100)
            expect(restored.longTrade.price).to.equal(102)
            expect(restored.shortTrade.price).to.equal(101)
            expect(restored.completed).to.equal(true)
        })
    })
})
