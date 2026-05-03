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
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)

        const trades = await store.readTradesArray(2024, 1, 1, 2024, 1, 1)
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
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        const trades = await store.readTradesArray(2024, 1, 1, 2024, 1, 1)
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
            fs.writeFileSync(path.join(dir, `2024-01-${String(day).padStart(2, '0')}.bin`), buf)
        }

        const store = new Trades(tmpDir, btcusdc)
        const trades = await store.readTradesArray(2024, 1, 1, 2024, 1, 3)
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
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)
        fs.writeFileSync(path.join(dir, '2024-01-03.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        const trades1 = await store.readTradesArray(2024, 1, 1, 2024, 1, 1)
        expect(trades1).to.have.length(3)
        const trades3 = await store.readTradesArray(2024, 1, 3, 2024, 1, 3)
        expect(trades3).to.have.length(3)
    })

    it('should chain across month boundaries', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf1 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf1, 0, 1706745600000000, 42000, 0.01, 420, false)
        fs.writeFileSync(path.join(dir, '2024-01-31.bin'), buf1)

        const buf2 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf2, 0, 1706832000000000, 43000, 0.01, 430, false)
        fs.writeFileSync(path.join(dir, '2024-02-01.bin'), buf2)

        const store = new Trades(tmpDir, btcusdc)
        const trades = await store.readTradesArray(2024, 1, 31, 2024, 2, 1)
        expect(trades).to.have.length(2)
        expect(trades[0].tsUs).to.equal(1706745600000000)
        expect(trades[1].tsUs).to.equal(1706832000000000)
    })

    it('should find a trade by tsUs via binary search', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const count = 100
        const baseTs = 1704067200000000
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * count)
        for (let i = 0; i < count; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, baseTs + i * 1000000, 42000 + i, 0.01, 420, i % 2 === 0)
        }
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        const trade = store.findTradeByTsUs(baseTs + 50 * 1000000)
        expect(trade.tsUs).to.equal(baseTs + 50 * 1000000)
        expect(trade.price).to.be.closeTo(42050, 0.01)
        expect(trade.srcId).to.equal(50 * Trade.RECORD_SIZE)
    })

    it('should throw when tsUs not found', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000, 0.01, 420, false)
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new Trades(tmpDir, btcusdc)
        expect(() => store.findTradeByTsUs(1704067200999999)).to.throw('Trade not found')
    })

    it('should throw when no data file for date', () => {
        const store = new Trades(tmpDir, btcusdc)
        expect(() => store.findTradeByTsUs(1704067200000000)).to.throw()
    })
})
