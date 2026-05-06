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

describe('Trades', () => {
    let tmpDir
    const sym = (() => {
        const s = new Symbol(getAsset('eth'), getAsset('usdc'))
        new Exchange('testex', [s], { downloadDay: async () => Buffer.alloc(0) })
        return s
    })()

    // 2024-01-01T00:00:00Z in microseconds
    const day1 = Day.fromStr('2024-01-01')
    const day2 = Day.fromStr('2024-01-02')
    const RS = Trade.RECORD_SIZE

    const writeDayFile = (dayTsUs, trades) => {
        const d = new Date(dayTsUs / 1000)
        const y = String(d.getUTCFullYear())
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        const dir = path.join(tmpDir, 'trades', 'testex', 'eth', 'usdc', y, m)
        fs.mkdirSync(dir, { recursive: true })
        const buf = Buffer.alloc(RS * trades.length)
        for (let i = 0; i < trades.length; i++) {
            const t = trades[i]
            Trade.writeRecord(buf, i * RS, i, t.tsUs, t.price, t.baseQty, t.quoteQty, t.isBuyerMaker)
        }
        fs.writeFileSync(path.join(dir, `${dd}.bin`), buf)
    }

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trades-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    describe('loadAsync', () => {
        it('should load a single day from disk', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 2000, baseQty: 0.1, quoteQty: 200, isBuyerMaker: false },
                { tsUs: day1 + 2000, price: 2001, baseQty: 0.2, quoteQty: 400, isBuyerMaker: true }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(2)
        })

        it('should load multiple days', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 2000, baseQty: 0.1, quoteQty: 200, isBuyerMaker: false }
            ])
            writeDayFile(day2, [
                { tsUs: day2 + 1000, price: 2100, baseQty: 0.1, quoteQty: 210, isBuyerMaker: false },
                { tsUs: day2 + 2000, price: 2101, baseQty: 0.2, quoteQty: 420, isBuyerMaker: true }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)
            expect(store.count).to.equal(3)
        })

        it('should handle missing day file as empty', async () => {
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(0)
        })

        it('should extend range on subsequent loads', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 2000, baseQty: 0.1, quoteQty: 200, isBuyerMaker: false }
            ])
            writeDayFile(day2, [
                { tsUs: day2 + 1000, price: 2100, baseQty: 0.1, quoteQty: 210, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(1)
            await store.loadAsync(day2, day2)
            expect(store.count).to.equal(2)
        })

        it('should load exactly one day when start equals end', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false },
                { tsUs: day1 + 2000, price: 200, baseQty: 0.2, quoteQty: 40, isBuyerMaker: true },
                { tsUs: day1 + 3000, price: 300, baseQty: 0.3, quoteQty: 90, isBuyerMaker: false }
            ])
            writeDayFile(day2, [
                { tsUs: day2 + 1000, price: 400, baseQty: 0.1, quoteQty: 40, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(3)
            expect(store.firstTsUs).to.equal(day1 + 1000)
            expect(store.lastTsUs).to.equal(day1 + 3000)
            expect(store.get(0).price).to.equal(100)
            expect(store.get(1).price).to.equal(200)
            expect(store.get(2).price).to.equal(300)
        })

        it('should not reload already loaded days', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 2000, baseQty: 0.1, quoteQty: 200, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            // Delete the file — second load should still work from memory
            fs.rmSync(path.join(tmpDir, 'trades'), { recursive: true })
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(1)
        })

        it('should throw on invalid params', async () => {
            const store = new Trades(tmpDir, sym)
            try { await store.loadAsync(-1, day1); expect.fail() } catch (e) { expect(e.message).to.include('non-negative') }
            try { await store.loadAsync(day2, day1); expect.fail() } catch (e) { expect(e.message).to.include('<=') }
        })
    })

    describe('firstTsUs / lastTsUs', () => {
        it('should return first and last timestamps', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 2000, baseQty: 0.1, quoteQty: 200, isBuyerMaker: false },
                { tsUs: day1 + 5000, price: 2001, baseQty: 0.1, quoteQty: 200, isBuyerMaker: false }
            ])
            writeDayFile(day2, [
                { tsUs: day2 + 3000, price: 2100, baseQty: 0.1, quoteQty: 210, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)
            expect(store.firstTsUs).to.equal(day1 + 1000)
            expect(store.lastTsUs).to.equal(day2 + 3000)
        })

        it('should return null when nothing loaded', () => {
            const store = new Trades(tmpDir, sym)
            expect(store.firstTsUs).to.equal(null)
            expect(store.lastTsUs).to.equal(null)
        })
    })

    describe('get', () => {
        it('should access trades by global index', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false },
                { tsUs: day1 + 2000, price: 200, baseQty: 0.2, quoteQty: 40, isBuyerMaker: true }
            ])
            writeDayFile(day2, [
                { tsUs: day2 + 1000, price: 300, baseQty: 0.3, quoteQty: 90, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day2)

            expect(store.get(0).price).to.equal(100)
            expect(store.get(1).price).to.equal(200)
            expect(store.get(2).price).to.equal(300)
        })

        it('should throw on out of bounds index', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.get(1)).to.throw('out of bounds')
        })
    })

    describe('getAt', () => {
        it('should access trade by tsUs and dayIndex', async () => {
            const ts1 = day1 + 1000
            const ts2 = day1 + 2000
            writeDayFile(day1, [
                { tsUs: ts1, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false },
                { tsUs: ts2, price: 200, baseQty: 0.2, quoteQty: 40, isBuyerMaker: true }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            const t0 = store.getAt(ts1, 0)
            expect(t0.price).to.equal(100)
            expect(t0.index).to.equal(0)

            const t1 = store.getAt(ts2, 1)
            expect(t1.price).to.equal(200)
            expect(t1.index).to.equal(1)
        })

        it('should throw on tsUs mismatch', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false },
                { tsUs: day1 + 2000, price: 200, baseQty: 0.2, quoteQty: 40, isBuyerMaker: true }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.getAt(day1 + 2000, 0)).to.throw('mismatch')
        })

        it('should throw on out of bounds dayIndex', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.getAt(day1 + 1000, 5)).to.throw('out of bounds')
        })

        it('should throw for unloaded day', async () => {
            const store = new Trades(tmpDir, sym)
            expect(() => store.getAt(day1 + 1000, 0)).to.throw('not loaded')
        })
    })

    describe('findByTsUs', () => {
        it('should find trade by exact timestamp', async () => {
            const ts = [day1 + 1000, day1 + 2000, day1 + 3000, day1 + 4000, day1 + 5000]
            writeDayFile(day1, ts.map((t, i) => ({
                tsUs: t, price: 100 + i, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false
            })))
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            expect(store.findByTsUs(ts[0]).price).to.equal(100)
            expect(store.findByTsUs(ts[2]).price).to.equal(102)
            expect(store.findByTsUs(ts[4]).price).to.equal(104)
        })

        it('should throw for non-existent timestamp', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)
            expect(() => store.findByTsUs(day1 + 9999)).to.throw('No record found')
        })

        it('should throw for unloaded day', () => {
            const store = new Trades(tmpDir, sym)
            expect(() => store.findByTsUs(day1 + 1000)).to.throw('not loaded')
        })

        it('should binary search correctly with many records', async () => {
            const count = 1000
            const trades = []
            for (let i = 0; i < count; i++) {
                trades.push({ tsUs: day1 + (i + 1) * 1000, price: 2000 + i, baseQty: 0.1, quoteQty: 200, isBuyerMaker: i % 2 === 0 })
            }
            writeDayFile(day1, trades)
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            // First, last, middle
            expect(store.findByTsUs(day1 + 1000).price).to.equal(2000)
            expect(store.findByTsUs(day1 + 1000000).price).to.equal(2999)
            expect(store.findByTsUs(day1 + 500000).price).to.equal(2499)
        })
    })

    describe('onActivity', () => {
        it('should emit loaded events', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false }
            ])
            const events = []
            const store = new Trades(tmpDir, sym)
            store.onActivity = (e) => events.push(e)
            await store.loadAsync(day1, day1)

            expect(events).to.have.length(1)
            expect(events[0].type).to.equal('loaded')
            expect(events[0].source).to.equal('disk')
            expect(events[0].records).to.equal(1)
        })
    })

    describe('trade as buffer view', () => {
        it('should return views into the same underlying buffer', async () => {
            writeDayFile(day1, [
                { tsUs: day1 + 1000, price: 100, baseQty: 0.1, quoteQty: 10, isBuyerMaker: false },
                { tsUs: day1 + 2000, price: 200, baseQty: 0.2, quoteQty: 40, isBuyerMaker: true }
            ])
            const store = new Trades(tmpDir, sym)
            await store.loadAsync(day1, day1)

            const t1a = store.get(0)
            const t1b = store.get(0)
            // Both should read the same price from the same buffer
            expect(t1a.price).to.equal(t1b.price)
            expect(t1a.tsUs).to.equal(t1b.tsUs)
        })
    })
})
