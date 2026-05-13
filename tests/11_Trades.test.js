import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import Trades from '../src/stores/Trades.js'
import Day from '../src/utils/Day.js'
import Exchange from '../src/core/Exchange.js'
import Symbol from '../src/core/Symbol.js'
import { getAsset } from '../src/core/assets.js'

// Build a test Symbol bound to a fake exchange (module-scope to avoid double-binding)
const sym = (() => {
    const s = new Symbol(getAsset('eth'), getAsset('usdc'))
    new Exchange('testex', [s], { downloadDay: async () => Buffer.alloc(0) })
    return s
})()

const day1 = Day.fromStr('2024-01-01')
const day2 = Day.fromStr('2024-01-02')
const day3 = Day.fromStr('2024-01-03')
const RS = Trade.RECORD_SIZE

const writeDayFile = (tmpDir, dayTsUs, trades) => {
    const d = new Date(dayTsUs / 1000)
    const y = String(d.getUTCFullYear())
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const dir = path.join(tmpDir, 'trades', 'testex', 'eth', 'usdc', y, m)
    fs.mkdirSync(dir, { recursive: true })
    const buf = Buffer.alloc(RS * trades.length)
    for (let i = 0; i < trades.length; i++) {
        const t = trades[i]
        Trade.writeRecord(buf, i * RS, t.tsUs, t.price, t.baseQty, t.quoteQty, t.isBuyerMaker)
    }
    fs.writeFileSync(path.join(dir, `${dd}.bin`), buf)
}

const trade = (tsUs, price, baseQty = 0.1, quoteQty = price * 0.1, isBuyerMaker = false) =>
    ({ tsUs, price, baseQty, quoteQty, isBuyerMaker })

describe('Trades', () => {
    let tmpDir

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trades-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    describe('loadAsync', () => {
        it('should load a single day from disk', async () => {
            writeDayFile(tmpDir, day1, [
                trade(day1 + 1000, 2000),
                trade(day1 + 2000, 2001, 0.2, 400, true)
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(2)
        })

        it('should load multiple days', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 2000)])
            writeDayFile(tmpDir, day2, [trade(day2 + 1000, 2100), trade(day2 + 2000, 2101)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)
            expect(store.count).to.equal(3)
        })

        it('should treat missing day file as empty (using downloader)', async () => {
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(0)
        })

        it('should extend range on subsequent loads', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 2000)])
            writeDayFile(tmpDir, day2, [trade(day2 + 1000, 2100)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(1)
            await store.loadAsync(day2, day2)
            expect(store.count).to.equal(2)
        })

        it('should load consecutive days correctly with order preserved', async () => {
            writeDayFile(tmpDir, day1, [
                trade(day1 + 1000, 100),
                trade(day1 + 2000, 200),
                trade(day1 + 3000, 300)
            ])
            writeDayFile(tmpDir, day2, [trade(day2 + 1000, 400)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)
            expect(store.count).to.equal(4)
            expect(store.firstTsUs).to.equal(day1 + 1000)
            expect(store.lastTsUs).to.equal(day2 + 1000)
            expect(store.get(0).price).to.equal(100)
            expect(store.get(3).price).to.equal(400)
        })

        it('should not reload already loaded days', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 2000)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            // Delete the file — second load should still work from memory
            fs.rmSync(path.join(tmpDir, 'trades'), { recursive: true })
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(1)
        })

        it('should throw on negative startTsUs', async () => {
            const store = new Trades(tmpDir, sym)
            try { await store.loadAsync(-1, day1); expect.fail() } catch (e) {
                expect(e.message).to.include('non-negative')
            }
        })

        it('should throw when start > end', async () => {
            const store = new Trades(tmpDir, sym)
            try { await store.loadAsync(day2, day1); expect.fail() } catch (e) {
                expect(e.message).to.include('<=')
            }
        })
    })

    describe('firstTsUs / lastTsUs', () => {
        it('should return first and last timestamps across loaded days', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 2000), trade(day1 + 5000, 2001)])
            writeDayFile(tmpDir, day2, [trade(day2 + 3000, 2100)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)
            expect(store.firstTsUs).to.equal(day1 + 1000)
            expect(store.lastTsUs).to.equal(day2 + 3000)
        })

        it('should return null when no data is loaded', () => {
            const store = new Trades(tmpDir, sym)
            expect(store.firstTsUs).to.equal(null)
            expect(store.lastTsUs).to.equal(null)
        })

        it('should return null for first/last when all loaded days are empty', async () => {
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.firstTsUs).to.equal(null)
            expect(store.lastTsUs).to.equal(null)
        })
    })

    describe('get', () => {
        it('should access trades by global index', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100), trade(day1 + 2000, 200)])
            writeDayFile(tmpDir, day2, [trade(day2 + 1000, 300)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)

            expect(store.get(0).price).to.equal(100)
            expect(store.get(1).price).to.equal(200)
            expect(store.get(2).price).to.equal(300)
        })

        it('should expose dayIndex and absoluteIndex on each trade', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100), trade(day1 + 2000, 200)])
            writeDayFile(tmpDir, day2, [trade(day2 + 1000, 300)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)

            expect(store.get(0).dayIndex).to.equal(0)
            expect(store.get(0).absoluteIndex).to.equal(0)
            expect(store.get(1).dayIndex).to.equal(1)
            expect(store.get(1).absoluteIndex).to.equal(1)
            expect(store.get(2).dayIndex).to.equal(0)
            expect(store.get(2).absoluteIndex).to.equal(2)
        })

        it('should throw on out-of-bounds index', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.get(1)).to.throw('out of bounds')
        })
    })

    describe('getAt', () => {
        it('should access trade by tsUs and dayIndex', async () => {
            const ts1 = day1 + 1000
            const ts2 = day1 + 2000
            writeDayFile(tmpDir, day1, [trade(ts1, 100), trade(ts2, 200)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            expect(store.getAt(ts1, 0).price).to.equal(100)
            expect(store.getAt(ts2, 1).price).to.equal(200)
        })

        it('should throw on tsUs mismatch at index', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100), trade(day1 + 2000, 200)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.getAt(day1 + 2000, 0)).to.throw('mismatch')
        })

        it('should throw on out-of-bounds dayIndex', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.getAt(day1 + 1000, 5)).to.throw('out of bounds')
        })

        it('should throw when day not loaded', () => {
            const store = new Trades(tmpDir, sym)
            expect(() => store.getAt(day1 + 1000, 0)).to.throw('not loaded')
        })

        it('should resolve dayIndex to correct day across multiple loaded days', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100), trade(day1 + 2000, 200)])
            writeDayFile(tmpDir, day2, [trade(day2 + 1000, 300)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)
            expect(store.getAt(day2 + 1000, 0).price).to.equal(300)
        })
    })

    describe('findByTsUs', () => {
        it('should find a trade by exact timestamp', async () => {
            const ts = [day1 + 1000, day1 + 2000, day1 + 3000, day1 + 4000, day1 + 5000]
            writeDayFile(tmpDir, day1, ts.map((t, i) => trade(t, 100 + i)))
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            expect(store.findByTsUs(ts[0]).price).to.equal(100)
            expect(store.findByTsUs(ts[2]).price).to.equal(102)
            expect(store.findByTsUs(ts[4]).price).to.equal(104)
        })

        it('should throw on non-existent timestamp', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.findByTsUs(day1 + 9999)).to.throw('No record found')
        })

        it('should throw when day not loaded', () => {
            const store = new Trades(tmpDir, sym)
            expect(() => store.findByTsUs(day1 + 1000)).to.throw('not loaded')
        })

        it('should binary search correctly with 1000 records', async () => {
            const count = 1000
            const trades = []
            for (let i = 0; i < count; i++) {
                trades.push(trade(day1 + (i + 1) * 1000, 2000 + i, 0.1, 200, i % 2 === 0))
            }
            writeDayFile(tmpDir, day1, trades)
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            expect(store.findByTsUs(day1 + 1000).price).to.equal(2000)
            expect(store.findByTsUs(day1 + 1000000).price).to.equal(2999)
            expect(store.findByTsUs(day1 + 500000).price).to.equal(2499)
        })
    })

    describe('getDay', () => {
        it('should return all trades for a loaded day', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100), trade(day1 + 2000, 200)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            const dayTrades = store.getDay(day1)
            expect(dayTrades).to.have.length(2)
            expect(dayTrades[0].price).to.equal(100)
            expect(dayTrades[1].price).to.equal(200)
        })

        it('should return empty array for an empty day', async () => {
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.getDay(day1)).to.have.length(0)
        })

        it('should throw for unloaded day', () => {
            const store = new Trades(tmpDir, sym)
            expect(() => store.getDay(day1)).to.throw('not loaded')
        })
    })

    describe('getRecordCount', () => {
        it('should return record count without loading buffer', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100), trade(day1 + 2000, 200)])
            const store = new Trades(tmpDir, sym)
            expect(await store.getRecordCount(day1)).to.equal(2)
        })

        it('should return 0 for missing day file', async () => {
            const store = new Trades(tmpDir, sym)
            expect(await store.getRecordCount(day1)).to.equal(0)
        })
    })

    describe('onActivity', () => {
        it('should emit loaded events with source=disk', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100)])
            const events = []
            const store = new Trades(tmpDir, sym)
            store.onActivity = (e) => events.push({ ...e })
            await store.loadAsync(day1, day1)

            const loaded = events.find(e => e.type === 'loaded')
            expect(loaded).to.exist
            expect(loaded.source).to.equal('disk')
            expect(loaded.records).to.equal(1)
        })

        it('should emit readFile events', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100)])
            const events = []
            const store = new Trades(tmpDir, sym)
            store.onActivity = (e) => events.push({ ...e })
            await store.loadAsync(day1, day1)

            expect(events.some(e => e.type === 'readFile')).to.equal(true)
        })

        it('should emit computing event when downloader is triggered', async () => {
            const events = []
            const store = new Trades(tmpDir, sym)
            store.onActivity = (e) => events.push({ ...e })
            await store.loadAsync(day1, day1)

            expect(events.some(e => e.type === 'computing')).to.equal(true)
        })
    })

    describe('multi-day buffers as live views', () => {
        it('should return live views into the underlying day buffer', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100), trade(day1 + 2000, 200)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            const a = store.get(0)
            const b = store.get(0)
            expect(a.price).to.equal(b.price)
            expect(a.tsUs).to.equal(b.tsUs)
        })
    })

    describe('three-day load with gaps', () => {
        it('should treat missing middle day as empty', async () => {
            writeDayFile(tmpDir, day1, [trade(day1 + 1000, 100)])
            writeDayFile(tmpDir, day3, [trade(day3 + 1000, 300)])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day3)
            expect(store.count).to.equal(2)
            expect(store.firstTsUs).to.equal(day1 + 1000)
            expect(store.lastTsUs).to.equal(day3 + 1000)
        })
    })
})
