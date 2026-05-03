import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import Trade from '../src/core/Trade.js'
import CandleDuration from '../src/core/CandleDuration.js'
import { binance } from '../src/exchanges/binance.js'
import CandleStore from '../src/sources/CandleStore.js'

describe('CandleStore', () => {
    let tmpDir
    const btcusdc = binance.getSymbol('btc:usdc')
    const duration = CandleDuration.MIN_1

    const writeTrades = (dir, date, trades) => {
        fs.mkdirSync(dir, { recursive: true })
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE * trades.length)
        for (let i = 0; i < trades.length; i++) {
            Trade.toBuffer(buf, i * Trade.RECORD_SIZE, trades[i].tsUs, trades[i].price, trades[i].baseQty, trades[i].quoteQty, trades[i].isBuyerMaker)
        }
        fs.writeFileSync(path.join(dir, `${date}.bin`), buf)
    }

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'candlestore-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should build and save candles from trades', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        // 3 trades within the same 1-min bucket, 1 in the next
        const baseTs = 1704067200_000_000 // 2024-01-01 00:00:00 UTC
        writeTrades(dir, '2024-01-01', [
            { tsUs: baseTs, price: 42000, baseQty: 0.1, quoteQty: 4200, isBuyerMaker: false },
            { tsUs: baseTs + 10_000_000, price: 42100, baseQty: 0.1, quoteQty: 4210, isBuyerMaker: false },
            { tsUs: baseTs + 20_000_000, price: 41900, baseQty: 0.1, quoteQty: 4190, isBuyerMaker: true },
            { tsUs: baseTs + 60_000_000, price: 42050, baseQty: 0.1, quoteQty: 4205, isBuyerMaker: false }
        ])

        const candleStore = new CandleStore(tmpDir, btcusdc, duration)

        expect(candleStore.hasDay(2024, 1, 1)).to.equal(false)
        await candleStore.ensureDay(2024, 1, 1)
        expect(candleStore.hasDay(2024, 1, 1)).to.equal(true)
        expect(candleStore.getCandleCount(2024, 1, 1)).to.equal(2)
    })

    it('should rehydrate candles from stored timestamps', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        const baseTs = 1704067200_000_000
        writeTrades(dir, '2024-01-01', [
            { tsUs: baseTs, price: 42000, baseQty: 0.5, quoteQty: 21000, isBuyerMaker: false },
            { tsUs: baseTs + 10_000_000, price: 42100, baseQty: 0.3, quoteQty: 12630, isBuyerMaker: false },
            { tsUs: baseTs + 20_000_000, price: 41900, baseQty: 0.2, quoteQty: 8380, isBuyerMaker: true }
        ])

        const candleStore = new CandleStore(tmpDir, btcusdc, duration)

        const candles = await candleStore.getCandles(2024, 1, 1)
        expect(candles).to.have.length(1)

        const c = candles[0]
        expect(c.open.tsUs).to.equal(baseTs)
        expect(c.open.price).to.equal(42000)
        expect(c.open.baseQty).to.equal(0.5)
        expect(c.close.tsUs).to.equal(baseTs + 20_000_000)
        expect(c.high.price).to.equal(42100)
        expect(c.low.price).to.equal(41900)
    })

    it('should skip if already built', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        const baseTs = 1704067200_000_000
        writeTrades(dir, '2024-01-01', [
            { tsUs: baseTs, price: 42000, baseQty: 0.1, quoteQty: 4200, isBuyerMaker: false }
        ])

        const candleStore = new CandleStore(tmpDir, btcusdc, duration)

        expect(await candleStore.ensureDay(2024, 1, 1)).to.equal(true)
        expect(await candleStore.ensureDay(2024, 1, 1)).to.equal(false)
    })

    it('should chain candles across days via generator', async () => {
        const dir = path.join(tmpDir, 'trades', 'binance', 'btcusdc')
        const day1Ts = 1704067200_000_000
        const day2Ts = 1704153600_000_000

        writeTrades(dir, '2024-01-01', [
            { tsUs: day1Ts, price: 42000, baseQty: 0.1, quoteQty: 4200, isBuyerMaker: false }
        ])
        writeTrades(dir, '2024-01-02', [
            { tsUs: day2Ts, price: 43000, baseQty: 0.1, quoteQty: 4300, isBuyerMaker: false }
        ])

        const candleStore = new CandleStore(tmpDir, btcusdc, duration)

        const candles = []
        for await (const candle of candleStore.readCandles(2024, 1, 1, 2024, 1, 2)) {
            candles.push(candle)
        }
        expect(candles).to.have.length(2)
        expect(candles[0].open.price).to.equal(42000)
        expect(candles[1].open.price).to.equal(43000)
    })
})
