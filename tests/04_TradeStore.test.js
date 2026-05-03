import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import Symbol from '../src/core/Symbol.js'
import { binance } from '../src/exchanges/binance.js'
import TradeStore from '../src/sources/TradeStore.js'

describe('TradeStore', () => {
    let tmpDir
    const btcusdc = binance.getSymbol('btc:usdc')

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tradestore-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should report hasDay=false for missing data', () => {
        const store = new TradeStore(tmpDir, btcusdc)
        expect(store.hasDay(2024, 1, 1)).to.equal(false)
    })

    it('should read trades from manually written daily file', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const count = 10
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * count)
        for (let i = 0; i < count; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + i * 1000000, 42000 + i, 0.01, 420, i % 2 === 0)
        }
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        expect(store.hasDay(2024, 1, 1)).to.equal(true)
        expect(store.getTradeCount(2024, 1, 1)).to.equal(10)

        const trades = store.readTradesArray(2024, 1, 1, 2024, 1, 1)
        expect(trades).to.have.length(10)
        expect(trades[0].tsUs).to.equal(1704067200000000)
        expect(trades[9].tsUs).to.equal(1704067200000000 + 9 * 1000000)
    })

    it('should set srcFile and srcOffset on loaded trades', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 3)
        for (let i = 0; i < 3; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + i * 1000000, 42000, 0.01, 420, false)
        }
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        const trades = store.readTradesArray(2024, 1, 1, 2024, 1, 1)
        expect(trades[0].srcFile).to.equal(path.join(dir, '2024-01-01.bin'))
        expect(trades[0].srcOffset).to.equal(0)
        expect(trades[1].srcOffset).to.equal(Trade.RECORD_SIZE)
        expect(trades[2].srcOffset).to.equal(Trade.RECORD_SIZE * 2)
    })

    it('should chain multiple days seamlessly', () => {
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

        const store = new TradeStore(tmpDir, btcusdc)
        const trades = store.readTradesArray(2024, 1, 1, 2024, 1, 3)
        expect(trades).to.have.length(15)
        expect(trades[0].tsUs).to.equal(1704067200000000 + 1000000)
        expect(trades[14].tsUs).to.equal(1704067200000000 + 15 * 1000000)
    })

    it('should skip missing days when chaining', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 3)
        for (let i = 0; i < 3; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, 1704067200000000 + i * 1000000, 42000, 0.01, 420, false)
        }
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)
        // day 2 missing
        fs.writeFileSync(path.join(dir, '2024-01-03.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        const trades = store.readTradesArray(2024, 1, 1, 2024, 1, 3)
        expect(trades).to.have.length(6)
    })

    it('should return info for a day', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 2)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000, 0.01, 420, false)
        Trade.toBuffer(buf, Trade.RECORD_SIZE, 1704153600000000, 43000, 0.02, 860, true)
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        const info = store.getInfo(2024, 1, 1)
        expect(info.count).to.equal(2)
        expect(info.firstTsUs).to.equal(1704067200000000)
        expect(info.lastTsUs).to.equal(1704153600000000)
    })

    it('should chain across month boundaries', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf1 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf1, 0, 1706745600000000, 42000, 0.01, 420, false)
        fs.writeFileSync(path.join(dir, '2024-01-31.bin'), buf1)

        const buf2 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf2, 0, 1706832000000000, 43000, 0.01, 430, false)
        fs.writeFileSync(path.join(dir, '2024-02-01.bin'), buf2)

        const store = new TradeStore(tmpDir, btcusdc)
        const trades = store.readTradesArray(2024, 1, 31, 2024, 2, 1)
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

        const store = new TradeStore(tmpDir, btcusdc)
        const trade = store.findTradeByTsUs(baseTs + 50 * 1000000)
        expect(trade.tsUs).to.equal(baseTs + 50 * 1000000)
        expect(trade.price).to.be.closeTo(42050, 0.01)
        expect(trade.srcFile).to.include('2024-01-01.bin')
        expect(trade.srcOffset).to.equal(50 * Trade.RECORD_SIZE)
    })

    it('should throw when tsUs not found', () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf, 0, 1704067200000000, 42000, 0.01, 420, false)
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        expect(() => store.findTradeByTsUs(1704067200999999)).to.throw('Trade not found')
    })

    it('should throw when no data file for date', () => {
        const store = new TradeStore(tmpDir, btcusdc)
        expect(() => store.findTradeByTsUs(1704067200000000)).to.throw('No trade data')
    })
})
