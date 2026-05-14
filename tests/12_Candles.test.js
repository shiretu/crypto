import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import { CandleRef } from '../src/core/Candle.js'
import Trades from '../src/stores/Trades.js'
import Candles from '../src/stores/Candles.js'
import Day from '../src/utils/Day.js'
import Exchange from '../src/core/Exchange.js'
import Symbol from '../src/core/Symbol.js'
import { getAsset } from '../src/core/assets.js'

// Build a test Symbol bound to a fake exchange (module-scope to avoid double-binding)
const sym = (() => {
    const s = new Symbol(getAsset('eth'), getAsset('usdc'))
    new Exchange('testex_c', [s], { downloadDay: async () => Buffer.alloc(0) })
    return s
})()

const day1 = Day.fromStr('2024-01-01')
const day2 = Day.fromStr('2024-01-02')
const day3 = Day.fromStr('2024-01-03')
const TRS = Trade.RECORD_SIZE
const FIVE_MIN_SEC = 300
const FIVE_MIN_US = FIVE_MIN_SEC * 1_000_000

const trade = (tsUs, price, baseQty = 0.1, quoteQty = price * 0.1, isBuyerMaker = false) =>
    ({ tsUs, price, baseQty, quoteQty, isBuyerMaker })

const writeTradesDayFile = (tmpDir, dayTsUs, trades) => {
    const d = new Date(dayTsUs / 1000)
    const y = String(d.getUTCFullYear())
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const dir = path.join(tmpDir, 'trades', 'testex_c', 'eth', 'usdc', y, m)
    fs.mkdirSync(dir, { recursive: true })
    const buf = Buffer.alloc(TRS * trades.length)
    for (let i = 0; i < trades.length; i++) {
        const t = trades[i]
        Trade.writeRecord(buf, i * TRS, t.tsUs, t.price, t.baseQty, t.quoteQty, t.isBuyerMaker)
    }
    fs.writeFileSync(path.join(dir, `${dd}.bin`), buf)
}

const candleFilePath = (tmpDir, durationSec, dayTsUs) => {
    const d = new Date(dayTsUs / 1000)
    const y = String(d.getUTCFullYear())
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return path.join(tmpDir, 'candles', 'testex_c', 'eth', 'usdc', String(durationSec), y, m, `${dd}.bin`)
}

describe('Candles', () => {
    let tmpDir

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'candles-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    describe('constructor', () => {
        it('should expose durationSec', () => {
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            expect(candles.durationSec).to.equal(FIVE_MIN_SEC)
        })

        it('should write/read files under data/candles/<exchange>/<base>/<quote>/<durationSec>/...', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(fs.existsSync(candleFilePath(tmpDir, FIVE_MIN_SEC, day1))).to.equal(true)
        })

        it('should keep different durations in different folders', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            const trades = new Trades(tmpDir, sym)
            const c300 = new Candles(tmpDir, sym, 300, trades)
            const c60 = new Candles(tmpDir, sym, 60, trades)
            await c300.loadAsync(day1, day1)
            await c60.loadAsync(day1, day1)
            expect(fs.existsSync(candleFilePath(tmpDir, 300, day1))).to.equal(true)
            expect(fs.existsSync(candleFilePath(tmpDir, 60, day1))).to.equal(true)
        })
    })

    describe('computeDayBuffer derivation', () => {
        it('should produce zero candles when there are no trades for the day', async () => {
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.count).to.equal(0)
        })

        it('should emit one candle with O=H=L=C all pointing at the same trade for a single-trade day', async () => {
            const ts = day1 + 1_234_000
            writeTradesDayFile(tmpDir, day1, [trade(ts, 2000)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.count).to.equal(1)
            const ref = candles.get(0)
            expect(ref.openTsUs).to.equal(ts)
            expect(ref.highTsUs).to.equal(ts)
            expect(ref.lowTsUs).to.equal(ts)
            expect(ref.closeTsUs).to.equal(ts)
            expect(ref.openDayIndex).to.equal(0)
            expect(ref.highDayIndex).to.equal(0)
            expect(ref.lowDayIndex).to.equal(0)
            expect(ref.closeDayIndex).to.equal(0)
        })

        it('should summarise multiple trades in the same bucket: open=first, close=last, high=max, low=min', async () => {
            // All four trades land in the same 5-min bucket at the start of the day
            const tFirst = day1 + 1_000_000 //   1s — first
            const tHigh = day1 + 50_000_000 //  50s — biggest price
            const tLow = day1 + 100_000_000 // 100s — smallest price
            const tLast = day1 + 200_000_000 // 200s — last (still < 300s)
            writeTradesDayFile(tmpDir, day1, [
                trade(tFirst, 2000),
                trade(tHigh, 2050),
                trade(tLow, 1950),
                trade(tLast, 2010)
            ])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.count).to.equal(1)
            const ref = candles.get(0)
            expect(ref.openTsUs).to.equal(tFirst)
            expect(ref.openDayIndex).to.equal(0)
            expect(ref.closeTsUs).to.equal(tLast)
            expect(ref.closeDayIndex).to.equal(3)
            expect(ref.highTsUs).to.equal(tHigh)
            expect(ref.highDayIndex).to.equal(1)
            expect(ref.lowTsUs).to.equal(tLow)
            expect(ref.lowDayIndex).to.equal(2)
        })

        it('should create separate candles for trades in different buckets', async () => {
            const t1 = day1 + 1_000_000 // bucket B
            const t2 = day1 + FIVE_MIN_US + 1_000_000 // bucket B+1
            writeTradesDayFile(tmpDir, day1, [trade(t1, 2000), trade(t2, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.count).to.equal(2)
            expect(candles.get(0).openTsUs).to.equal(t1)
            expect(candles.get(1).openTsUs).to.equal(t2)
        })

        it('should fill gaps with empty candles between buckets', async () => {
            const t1 = day1 + 1_000_000 // bucket B
            const t2 = day1 + 3 * FIVE_MIN_US + 1_000_000 // bucket B+3 — B+1 and B+2 are gaps
            writeTradesDayFile(tmpDir, day1, [trade(t1, 2000), trade(t2, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.count).to.equal(4)
            expect(candles.get(0).openTsUs).to.equal(t1)
            expect(candles.get(1).openTsUs).to.equal(0) // empty sentinel
            expect(candles.get(2).openTsUs).to.equal(0) // empty sentinel
            expect(candles.get(3).openTsUs).to.equal(t2)
        })

        it('should place a trade landing exactly on a bucket boundary into the new bucket', async () => {
            const ordinalN = Math.floor(day1 / FIVE_MIN_US)
            const tInN = ordinalN * FIVE_MIN_US + 1_000_000 // strictly inside bucket N
            const tOnBoundary = (ordinalN + 1) * FIVE_MIN_US // exact start of bucket N+1
            writeTradesDayFile(tmpDir, day1, [trade(tInN, 2000), trade(tOnBoundary, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.count).to.equal(2)
            expect(candles.get(0).openTsUs).to.equal(tInN)
            expect(candles.get(1).openTsUs).to.equal(tOnBoundary)
        })
    })

    describe('compute-on-miss + caching', () => {
        it('should write the derived candle file to disk on first loadAsync', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            const filePath = candleFilePath(tmpDir, FIVE_MIN_SEC, day1)
            expect(fs.existsSync(filePath)).to.equal(false)
            await candles.loadAsync(day1, day1)
            expect(fs.existsSync(filePath)).to.equal(true)
        })

        it('should emit computing and a loaded(source=computed) event on first load', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            const events = []
            candles.onActivity = e => events.push({ ...e })
            await candles.loadAsync(day1, day1)
            expect(events.some(e => e.type === 'computing')).to.equal(true)
            const loaded = events.find(e => e.type === 'loaded')
            expect(loaded).to.exist
            expect(loaded.source).to.equal('computed')
        })

        it('should read from disk (not recompute) on a subsequent load by a fresh store instance', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            // First pass: derive + persist
            const trades1 = new Trades(tmpDir, sym)
            const candles1 = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades1)
            await candles1.loadAsync(day1, day1)
            // Second pass: fresh stores, should read the cached candle file
            const trades2 = new Trades(tmpDir, sym)
            const candles2 = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades2)
            const events = []
            candles2.onActivity = e => events.push({ ...e })
            await candles2.loadAsync(day1, day1)
            const loaded = events.find(e => e.type === 'loaded')
            expect(loaded).to.exist
            expect(loaded.source).to.equal('disk')
            expect(events.some(e => e.type === 'computing')).to.equal(false)
        })

        it('should not reload an already-loaded day on a second loadAsync of the same store', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            // Delete the cached file — second loadAsync should still work from memory
            fs.rmSync(path.join(tmpDir, 'candles'), { recursive: true })
            await candles.loadAsync(day1, day1)
            expect(candles.count).to.equal(1)
        })
    })

    describe('inherited accessors against CandleRef records', () => {
        it('get(idx) returns a CandleRef instance with correct open/close/high/low getters', async () => {
            const ts = day1 + 1_000_000
            writeTradesDayFile(tmpDir, day1, [trade(ts, 2000)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            const ref = candles.get(0)
            expect(ref).to.be.instanceOf(CandleRef)
            expect(ref.openTsUs).to.equal(ts)
            expect(ref.closeTsUs).to.equal(ts)
            expect(ref.highTsUs).to.equal(ts)
            expect(ref.lowTsUs).to.equal(ts)
        })

        it('count reflects total candles across multiple loaded days', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            writeTradesDayFile(tmpDir, day2, [trade(day2 + 1_000_000, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day2)
            expect(candles.count).to.equal(2)
        })

        it('getDay returns every candle ref for the requested day', async () => {
            const t1 = day1 + 1_000_000
            const t2 = day1 + FIVE_MIN_US + 1_000_000
            writeTradesDayFile(tmpDir, day1, [trade(t1, 2000), trade(t2, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            const dayCandles = candles.getDay(day1)
            expect(dayCandles).to.have.length(2)
            expect(dayCandles[0].openTsUs).to.equal(t1)
            expect(dayCandles[1].openTsUs).to.equal(t2)
        })

        it('findByTsUs finds the candle whose first-8-bytes (openTsUs) match', async () => {
            const t1 = day1 + 1_000_000
            const t2 = day1 + FIVE_MIN_US + 1_000_000
            writeTradesDayFile(tmpDir, day1, [trade(t1, 2000), trade(t2, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.findByTsUs(t1).openTsUs).to.equal(t1)
            expect(candles.findByTsUs(t2).openTsUs).to.equal(t2)
        })

        it('getAt(openTsUs, dayIndex) returns the candle ref at that position', async () => {
            const ts = day1 + 1_000_000
            writeTradesDayFile(tmpDir, day1, [trade(ts, 2000)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.getAt(ts, 0).openTsUs).to.equal(ts)
        })
    })

    describe('findByTsUs with empty candles interleaved', () => {
        it('should still find real candles on either side of empty-candle gaps within the same day', async () => {
            const t1 = day1 + 1_000_000 // bucket B
            const t2 = day1 + 3 * FIVE_MIN_US + 1_000_000 // bucket B+3, after 2 empty buckets
            writeTradesDayFile(tmpDir, day1, [trade(t1, 2000), trade(t2, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day1)
            expect(candles.findByTsUs(t1).openTsUs).to.equal(t1)
            expect(candles.findByTsUs(t2).openTsUs).to.equal(t2)
        })
    })

    describe('multi-day load', () => {
        it('should derive candles for each day independently', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            writeTradesDayFile(tmpDir, day2, [trade(day2 + 1_000_000, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day2)
            expect(candles.count).to.equal(2)
            expect(candles.get(0).openTsUs).to.equal(day1 + 1_000_000)
            expect(candles.get(1).openTsUs).to.equal(day2 + 1_000_000)
        })

        it('should treat a missing middle day as empty (no candles for it)', async () => {
            writeTradesDayFile(tmpDir, day1, [trade(day1 + 1_000_000, 2000)])
            writeTradesDayFile(tmpDir, day3, [trade(day3 + 1_000_000, 2100)])
            const trades = new Trades(tmpDir, sym)
            const candles = new Candles(tmpDir, sym, FIVE_MIN_SEC, trades)
            await candles.loadAsync(day1, day3)
            expect(candles.count).to.equal(2)
        })
    })

    // NOTE: Candles.fromAnonymousObject round-trip is not covered here because
    // it depends on the global exchanges registry, which only knows `binance`.
    // Same omission as 11_Trades.test.js for `Trades.fromAnonymousObject`.
})
