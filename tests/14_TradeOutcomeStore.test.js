import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import { binance } from '../src/exchanges/binance.js'
import TradeOutcomes from '../src/stores/TradeOutcomes.js'

const RECORD_SIZE = 48

describe('TradeOutcomeStore', () => {
    let tmpDir
    const btcusdc = binance.getSymbol('btc:usdc')
    const tpPercent = 1.5
    const slPercent = 1

    const writeTrades = (date, trades) => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        const [y, m, d] = date.split('-')
        const filePath = path.join(dir, y, m, `${d}.bin`)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * trades.length)
        for (let i = 0; i < trades.length; i++) {
            const t = trades[i]
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, t.tsUs, t.price, t.baseQty, t.quoteQty, t.isBuyerMaker)
        }
        fs.writeFileSync(filePath, buf)
    }

    const writeOutcomes = (date, outcomes) => {
        const dir = path.join(tmpDir, 'outcomes', 'binance', 'btcusdc', `tp${tpPercent}_sl${slPercent}`)
        const [y, m, d] = date.split('-')
        const filePath = path.join(dir, y, m, `${d}.bin`)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        const buf = Buffer.allocUnsafe(RECORD_SIZE * outcomes.length)
        for (let i = 0; i < outcomes.length; i++) {
            const off = i * RECORD_SIZE
            const o = outcomes[i]
            buf.writeBigUInt64LE(BigInt(o.openTsUs), off)
            buf.writeBigUInt64LE(BigInt(o.openSrcId), off + 8)
            buf.writeBigUInt64LE(BigInt(o.longCloseTsUs), off + 16)
            buf.writeBigUInt64LE(BigInt(o.longCloseSrcId), off + 24)
            buf.writeBigUInt64LE(BigInt(o.shortCloseTsUs), off + 32)
            buf.writeBigUInt64LE(BigInt(o.shortCloseSrcId), off + 40)
        }
        fs.writeFileSync(filePath, buf)
    }

    // Base timestamp: 2024-01-01T00:00:00Z in microseconds
    const baseTs = 1704067200_000_000
    const RS = Trade.RECORD_SIZE

    // A minimal scenario: 5 trades on day 1
    // Trade 0: open at 42000 (baseTs, srcId=0)
    // Trade 1: price goes up to 42630 → triggers long TP (1.5%) at baseTs+1s (srcId=RS)
    //          also triggers short SL (1.5%) simultaneously
    // Trade 2: price goes down to 41580 → triggers long SL and short TP for trade 2's outcome
    // etc.
    const setupDay1 = () => {
        const trades = [
            { tsUs: baseTs, price: 42000, baseQty: 0.1, quoteQty: 4200, isBuyerMaker: false },
            { tsUs: baseTs + 1_000_000, price: 42630, baseQty: 0.1, quoteQty: 4263, isBuyerMaker: false },
            { tsUs: baseTs + 2_000_000, price: 41580, baseQty: 0.1, quoteQty: 4158, isBuyerMaker: true },
            { tsUs: baseTs + 3_000_000, price: 42200, baseQty: 0.1, quoteQty: 4220, isBuyerMaker: false },
            { tsUs: baseTs + 4_000_000, price: 42100, baseQty: 0.1, quoteQty: 4210, isBuyerMaker: false }
        ]
        writeTrades('2024-01-01', trades)

        // Outcome for trade 0: opened at 42000 (srcId=0)
        //   long closes at trade 1 (42630, 1.5% TP) → tsUs=baseTs+1s, srcId=RS
        //   short closes at trade 1 (42630, 1.5% SL) → tsUs=baseTs+1s, srcId=RS
        // Outcome for trade 1: opened at 42630 (srcId=RS)
        //   long closes at trade 2 (41580, ~2.5% drop → SL) → tsUs=baseTs+2s, srcId=2*RS
        //   short closes at trade 2 (41580, ~2.5% drop → TP) → tsUs=baseTs+2s, srcId=2*RS
        const outcomes = [
            {
                openTsUs: baseTs,
                openSrcId: 0,
                longCloseTsUs: baseTs + 1_000_000,
                longCloseSrcId: RS,
                shortCloseTsUs: baseTs + 1_000_000,
                shortCloseSrcId: RS
            },
            {
                openTsUs: baseTs + 1_000_000,
                openSrcId: RS,
                longCloseTsUs: baseTs + 2_000_000,
                longCloseSrcId: 2 * RS,
                shortCloseTsUs: baseTs + 2_000_000,
                shortCloseSrcId: 2 * RS
            }
        ]
        writeOutcomes('2024-01-01', outcomes)
        return { trades, outcomes }
    }

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcomestore-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should reject non-positive tpPercent', () => {
        expect(() => new TradeOutcomes(tmpDir, btcusdc, { tpPercent: 0, slPercent: 1 })).to.throw('tpPercent')
    })

    it('should reject non-positive slPercent', () => {
        expect(() => new TradeOutcomes(tmpDir, btcusdc, { tpPercent: 1, slPercent: -1 })).to.throw('slPercent')
    })

    it('should reject symbol without exchange', () => {
        const noExSym = { base: { id: 'btc' }, quote: { id: 'usdc' }, exchange: null }
        expect(() => new TradeOutcomes(tmpDir, noExSym, { tpPercent: 1, slPercent: 1 })).to.throw('exchange')
    })

    describe('readAsync', () => {
        it('should yield outcomes from pre-written file', async () => {
            const { outcomes: written } = setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            const results = []
            for await (const outcome of store.readAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })) {
                results.push(outcome)
            }

            expect(results).to.have.length(2)
            expect(results[0].completed).to.equal(true)
            expect(results[1].completed).to.equal(true)
        })

        it('should hydrate open trade correctly', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            const results = []
            for await (const outcome of store.readAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })) {
                results.push(outcome)
            }

            const lo0 = results[0].longOrder
            expect(lo0.open.price).to.equal(42000)
            expect(lo0.open.tsUs).to.equal(baseTs)

            const lo1 = results[1].longOrder
            expect(lo1.open.price).to.equal(42630)
            expect(lo1.open.tsUs).to.equal(baseTs + 1_000_000)
        })

        it('should hydrate close trades correctly', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            const results = []
            for await (const outcome of store.readAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })) {
                results.push(outcome)
            }

            // outcome 0: long closed at trade 1 (price 42630)
            expect(results[0].longOrder.close.price).to.equal(42630)
            expect(results[0].longOrder.close.tsUs).to.equal(baseTs + 1_000_000)

            // outcome 0: short also closed at trade 1
            expect(results[0].shortOrder.close.price).to.equal(42630)

            // outcome 1: both closed at trade 2 (price 41580)
            expect(results[1].longOrder.close.price).to.equal(41580)
            expect(results[1].shortOrder.close.price).to.equal(41580)
        })

        it('should yield nothing for empty outcome file', async () => {
            writeTrades('2024-01-01', [
                { tsUs: baseTs, price: 42000, baseQty: 0.1, quoteQty: 4200, isBuyerMaker: false }
            ])
            writeOutcomes('2024-01-01', [])

            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })
            const results = []
            for await (const outcome of store.readAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })) {
                results.push(outcome)
            }
            expect(results).to.have.length(0)
        })

        it('should chain outcomes across multiple days', async () => {
            setupDay1()

            const day2Ts = 1704153600_000_000 // 2024-01-02T00:00:00Z
            writeTrades('2024-01-02', [
                { tsUs: day2Ts, price: 43000, baseQty: 0.1, quoteQty: 4300, isBuyerMaker: false },
                { tsUs: day2Ts + 1_000_000, price: 43645, baseQty: 0.1, quoteQty: 4365, isBuyerMaker: false }
            ])
            writeOutcomes('2024-01-02', [
                {
                    openTsUs: day2Ts,
                    openSrcId: 0,
                    longCloseTsUs: day2Ts + 1_000_000,
                    longCloseSrcId: RS,
                    shortCloseTsUs: day2Ts + 1_000_000,
                    shortCloseSrcId: RS
                }
            ])

            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })
            const results = []
            for await (const outcome of store.readAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 2 })) {
                results.push(outcome)
            }

            expect(results).to.have.length(3)
            expect(results[0].longOrder.open.price).to.equal(42000)
            expect(results[2].longOrder.open.price).to.equal(43000)
        })
    })

    describe('readArrayAsync', () => {
        it('should return all outcomes as array', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            const results = await store.readArrayAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })
            expect(results).to.have.length(2)
            expect(results[0].completed).to.equal(true)
            expect(results[1].completed).to.equal(true)
        })
    })

    describe('readAtAsync', () => {
        it('should find outcome by exact openTsUs', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            const outcome = await store.readAtAsync(baseTs)
            expect(outcome.completed).to.equal(true)
            expect(outcome.longOrder.open.price).to.equal(42000)
            expect(outcome.longOrder.close.price).to.equal(42630)
        })

        it('should find second outcome by tsUs', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            const outcome = await store.readAtAsync(baseTs + 1_000_000)
            expect(outcome.completed).to.equal(true)
            expect(outcome.longOrder.open.price).to.equal(42630)
            expect(outcome.longOrder.close.price).to.equal(41580)
        })

        it('should throw for non-existent tsUs', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            try {
                await store.readAtAsync(baseTs + 500_000)
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.include('No outcome found')
            }
        })

        it('should binary search correctly with many records', async () => {
            const count = 100
            const trades = []
            const outcomes = []
            // Alternating open/close pairs: even indices are opens, odd are closes
            for (let i = 0; i < count; i++) {
                const openPrice = 42000 + i
                trades.push({
                    tsUs: baseTs + (2 * i) * 1_000_000,
                    price: openPrice,
                    baseQty: 0.1,
                    quoteQty: 4200,
                    isBuyerMaker: false
                })
                trades.push({
                    tsUs: baseTs + (2 * i + 1) * 1_000_000,
                    price: openPrice * 1.02,
                    baseQty: 0.1,
                    quoteQty: 4200,
                    isBuyerMaker: false
                })
                outcomes.push({
                    openTsUs: baseTs + (2 * i) * 1_000_000,
                    openSrcId: (2 * i) * RS,
                    longCloseTsUs: baseTs + (2 * i + 1) * 1_000_000,
                    longCloseSrcId: (2 * i + 1) * RS,
                    shortCloseTsUs: baseTs + (2 * i + 1) * 1_000_000,
                    shortCloseSrcId: (2 * i + 1) * RS
                })
            }
            writeTrades('2024-01-01', trades)
            writeOutcomes('2024-01-01', outcomes)

            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            // Find first
            const first = await store.readAtAsync(baseTs)
            expect(first.longOrder.open.price).to.equal(42000)

            // Find last
            const last = await store.readAtAsync(baseTs + 99 * 2 * 1_000_000)
            expect(last.longOrder.open.price).to.equal(42099)

            // Find middle
            const mid = await store.readAtAsync(baseTs + 50 * 2 * 1_000_000)
            expect(mid.longOrder.open.price).to.equal(42050)
        })

        it('should not interfere with readAsync cached file', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })

            // Start iterating with readAsync
            const results = []
            for await (const outcome of store.readAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })) {
                results.push(outcome)
                // Call readAtAsync in the middle of iteration
                const lookup = await store.readAtAsync(baseTs)
                expect(lookup.longOrder.open.price).to.equal(42000)
            }

            expect(results).to.have.length(2)
        })
    })

    describe('order details', () => {
        it('should produce correct long profit percent for TP', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })
            const outcome = await store.readAtAsync(baseTs)

            // open=42000, close=42630 → (42630-42000)/42000*100 = 1.5%
            expect(outcome.longOrder.profitPercent).to.be.closeTo(1.5, 0.01)
        })

        it('should produce correct short profit percent for SL', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })
            const outcome = await store.readAtAsync(baseTs)

            // open=42000, close=42630 → (42000-42630)/42000*100 = -1.5%
            expect(outcome.shortOrder.profitPercent).to.be.closeTo(-1.5, 0.01)
        })

        it('should compute duration correctly', async () => {
            setupDay1()
            const store = new TradeOutcomes(tmpDir, btcusdc, { tpPercent, slPercent })
            const outcome = await store.readAtAsync(baseTs)

            expect(outcome.longOrder.durationUs).to.equal(1_000_000)
            expect(outcome.shortOrder.durationUs).to.equal(1_000_000)
        })
    })
})
