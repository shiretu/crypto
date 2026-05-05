import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import Symbol from '../src/core/Symbol.js'
import { binance } from '../src/exchanges/binance.js'
import Trades from '../src/stores/Trades.js'

describe('TradeStore', () => {
    let tmpDir
    const btcusdc = binance.getSymbol('btc:usdc')

    const writeFile = (filePath, data) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, data)
    }

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tradestore-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should read trades from manually written daily file', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const count = 10
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * count)
        for (let i = 0; i < count; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + i * 1000000, 42000 + i, 0.01, 420, i % 2 === 0)
        }
        writeFile(path.join(dir, '2024', '01', '01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)

        const trades = await store.readArrayAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })
        expect(trades).to.have.length(10)
        expect(trades[0].tsUs).to.equal(1704067200000000)
        expect(trades[9].tsUs).to.equal(1704067200000000 + 9 * 1000000)
    })

    it('should set srcId on loaded trades', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 3)
        for (let i = 0; i < 3; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + i * 1000000, 42000, 0.01, 420, false)
        }
        writeFile(path.join(dir, '2024', '01', '01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        const trades = await store.readArrayAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })
        expect(trades[0].srcId).to.equal(0)
        expect(trades[1].srcId).to.equal(Trade.RECORD_SIZE)
        expect(trades[2].srcId).to.equal(Trade.RECORD_SIZE * 2)
    })

    it('should chain multiple days seamlessly', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        for (const day of [1, 2, 3]) {
            const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 5)
            for (let i = 0; i < 5; i++) {
                const seqId = (day - 1) * 5 + i + 1
                Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + seqId * 1000000, 42000, 0.01, 420, false)
            }
            writeFile(path.join(dir, '2024', '01', `${String(day).padStart(2, '0')}.bin`), buf)
        }

        const store = new Trades(tmpDir, btcusdc)
        const trades = await store.readArrayAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 3 })
        expect(trades).to.have.length(15)
        expect(trades[0].tsUs).to.equal(1704067200000000 + 1000000)
        expect(trades[14].tsUs).to.equal(1704067200000000 + 15 * 1000000)
    })

    it('should read pre-existing trades without downloading', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 3)
        for (let i = 0; i < 3; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + i * 1000000, 42000, 0.01, 420, false)
        }
        writeFile(path.join(dir, '2024', '01', '01.bin'), buf)
        writeFile(path.join(dir, '2024', '01', '03.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        const trades1 = await store.readArrayAsync({ year: 2024, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 })
        expect(trades1).to.have.length(3)
        const trades3 = await store.readArrayAsync({ year: 2024, month: 1, day: 3 }, { year: 2024, month: 1, day: 3 })
        expect(trades3).to.have.length(3)
    })

    it('should chain across month boundaries', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf1 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf1, 0, 1706745600000000, 42000, 0.01, 420, false)
        writeFile(path.join(dir, '2024', '01', '31.bin'), buf1)

        const buf2 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf2, 0, 1706832000000000, 43000, 0.01, 430, false)
        writeFile(path.join(dir, '2024', '02', '01.bin'), buf2)

        const store = new Trades(tmpDir, btcusdc)
        const trades = await store.readArrayAsync({ year: 2024, month: 1, day: 31 }, { year: 2024, month: 2, day: 1 })
        expect(trades).to.have.length(2)
        expect(trades[0].tsUs).to.equal(1706745600000000)
        expect(trades[1].tsUs).to.equal(1706832000000000)
    })

    it('should readAtAsync a valid srcId', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const count = 5
        const baseTs = 1704067200000000
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * count)
        for (let i = 0; i < count; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, baseTs + i * 1000000, 42000 + i, 0.01, 420, false)
        }
        writeFile(path.join(dir, '2024', '01', '01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        const trade = await store.readAtAsync(baseTs + 3 * 1000000, 3 * Trade.RECORD_SIZE)
        expect(trade.tsUs).to.equal(baseTs + 3 * 1000000)
        expect(trade.price).to.be.closeTo(42003, 0.01)
        expect(trade.srcId).to.equal(3 * Trade.RECORD_SIZE)
    })

    it('should reuse FilePart across readAtAsync calls for same day', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const count = 5
        const baseTs = 1704067200000000
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * count)
        for (let i = 0; i < count; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, baseTs + i * 1000000, 42000 + i, 0.01, 420, false)
        }
        writeFile(path.join(dir, '2024', '01', '01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        const t1 = await store.readAtAsync(baseTs, 0)
        const t2 = await store.readAtAsync(baseTs + 1000000, Trade.RECORD_SIZE)
        const t3 = await store.readAtAsync(baseTs + 4 * 1000000, 4 * Trade.RECORD_SIZE)
        expect(t1.price).to.be.closeTo(42000, 0.01)
        expect(t2.price).to.be.closeTo(42001, 0.01)
        expect(t3.price).to.be.closeTo(42004, 0.01)
    })

    it('should throw readAtAsync on out-of-bounds srcId', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000, 0.01, 420, false)
        writeFile(path.join(dir, '2024', '01', '01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        try {
            await store.readAtAsync(1704067200000000, Trade.RECORD_SIZE)
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('Cannot read')
        }
    })

    it('should throw readAtAsync on tsUs mismatch', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000, 0.01, 420, false)
        writeFile(path.join(dir, '2024', '01', '01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        try {
            await store.readAtAsync(1704067200999999, 0)
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('expected')
        }
    })
})
