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
        const dir = path.join(tmpDir, 'raw', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const count = 10
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * count)
        for (let i = 0; i < count; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, i + 1, 1704067200000000 + i * 1000000, 42000 + i, 0.01, 420, i % 2 === 0)
        }
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        expect(store.hasDay(2024, 1, 1)).to.equal(true)
        expect(store.getTradeCount(2024, 1, 1)).to.equal(10)

        const trades = store.readTradesArray(2024, 1, 1, 2024, 1, 1)
        expect(trades).to.have.length(10)
        expect(trades[0].id).to.equal(1)
        expect(trades[9].id).to.equal(10)
    })

    it('should chain multiple days seamlessly', () => {
        const dir = path.join(tmpDir, 'raw', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        for (const day of [1, 2, 3]) {
            const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 5)
            for (let i = 0; i < 5; i++) {
                const id = (day - 1) * 5 + i + 1
                Trade.toBuffer(buf, i * Trade.RECORD_SIZE, id, 1704067200000000 + id * 1000000, 42000, 0.01, 420, false)
            }
            fs.writeFileSync(path.join(dir, `2024-01-${String(day).padStart(2, '0')}.bin`), buf)
        }

        const store = new TradeStore(tmpDir, btcusdc)
        const trades = store.readTradesArray(2024, 1, 1, 2024, 1, 3)
        expect(trades).to.have.length(15)
        expect(trades[0].id).to.equal(1)
        expect(trades[14].id).to.equal(15)
    })

    it('should skip missing days when chaining', () => {
        const dir = path.join(tmpDir, 'raw', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 3)
        for (let i = 0; i < 3; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, i + 1, 1704067200000000 + i * 1000000, 42000, 0.01, 420, false)
        }
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)
        // day 2 missing
        fs.writeFileSync(path.join(dir, '2024-01-03.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        const trades = store.readTradesArray(2024, 1, 1, 2024, 1, 3)
        expect(trades).to.have.length(6)
    })

    it('should return info for a day', () => {
        const dir = path.join(tmpDir, 'raw', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * 2)
        Trade.toBuffer(buf, 0, 1, 1704067200000000, 42000, 0.01, 420, false)
        Trade.toBuffer(buf, Trade.RECORD_SIZE, 2, 1704153600000000, 43000, 0.02, 860, true)
        fs.writeFileSync(path.join(dir, '2024-01-01.bin'), buf)

        const store = new TradeStore(tmpDir, btcusdc)
        const info = store.getInfo(2024, 1, 1)
        expect(info.count).to.equal(2)
        expect(info.firstTsUs).to.equal(1704067200000000)
        expect(info.lastTsUs).to.equal(1704153600000000)
    })

    it('should chain across month boundaries', () => {
        const dir = path.join(tmpDir, 'raw', 'binance', 'btcusdc')
        fs.mkdirSync(dir, { recursive: true })

        const buf1 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf1, 0, 1, 1706745600000000, 42000, 0.01, 420, false)
        fs.writeFileSync(path.join(dir, '2024-01-31.bin'), buf1)

        const buf2 = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        Trade.toBuffer(buf2, 0, 2, 1706832000000000, 43000, 0.01, 430, false)
        fs.writeFileSync(path.join(dir, '2024-02-01.bin'), buf2)

        const store = new TradeStore(tmpDir, btcusdc)
        const trades = store.readTradesArray(2024, 1, 31, 2024, 2, 1)
        expect(trades).to.have.length(2)
        expect(trades[0].id).to.equal(1)
        expect(trades[1].id).to.equal(2)
    })
})
