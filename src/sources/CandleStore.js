import fs from 'fs'
import path from 'path'
import Candle from '../core/Candle.js'
import { isValidDuration } from '../core/CandleDuration.js'
import TradeStore from './TradeStore.js'

const CANDLE_RECORD_SIZE = 32

export default class CandleStore {
    #dataDir
    #symbol
    #durationSec
    #tradeStore

    constructor (dataDir, symbol, durationSec) {
        if (!isValidDuration(durationSec)) throw new Error(`Invalid candle duration: ${durationSec}`)
        if (!symbol.exchange) throw new Error('Symbol must belong to an exchange')
        this.#dataDir = dataDir
        this.#symbol = symbol
        this.#durationSec = durationSec
        this.#tradeStore = new TradeStore(dataDir, symbol)
    }

    #dir () {
        return path.join(this.#dataDir, 'candles', this.#symbol.exchange.id,
            `${this.#symbol.base.id}${this.#symbol.quote.id}`, String(this.#durationSec))
    }

    #file (year, month, day) {
        return path.join(this.#dir(),
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.bin`)
    }

    hasDay (year, month, day) {
        return fs.existsSync(this.#file(year, month, day))
    }

    #buildCandlesFromTrades (year, month, day) {
        const durationUs = this.#durationSec * 1_000_000
        const candles = []
        let current = null

        for (const trade of this.#tradeStore.readTrades(year, month, day, year, month, day)) {
            const idx = Math.floor(trade.tsUs / durationUs)
            if (!current || current.index !== idx) {
                if (current) candles.push(current)
                current = new Candle(this.#durationSec, trade)
            } else {
                current.update(trade)
            }
        }
        if (current) candles.push(current)
        return candles
    }

    #saveCandles (year, month, day, candles) {
        const file = this.#file(year, month, day)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        const buf = Buffer.allocUnsafe(candles.length * CANDLE_RECORD_SIZE)
        for (let i = 0; i < candles.length; i++) {
            const offset = i * CANDLE_RECORD_SIZE
            const c = candles[i]
            buf.writeBigUInt64LE(BigInt(c.open.tsUs), offset)
            buf.writeBigUInt64LE(BigInt(c.close.tsUs), offset + 8)
            buf.writeBigUInt64LE(BigInt(c.high.tsUs), offset + 16)
            buf.writeBigUInt64LE(BigInt(c.low.tsUs), offset + 24)
        }
        fs.writeFileSync(file, buf)
    }

    #loadCandles (year, month, day) {
        const file = this.#file(year, month, day)
        if (!fs.existsSync(file)) return null
        const buf = fs.readFileSync(file)
        const count = Math.floor(buf.length / CANDLE_RECORD_SIZE)
        const candles = []
        for (let i = 0; i < count; i++) {
            const offset = i * CANDLE_RECORD_SIZE
            const openTsUs = Number(buf.readBigUInt64LE(offset))
            const closeTsUs = Number(buf.readBigUInt64LE(offset + 8))
            const highTsUs = Number(buf.readBigUInt64LE(offset + 16))
            const lowTsUs = Number(buf.readBigUInt64LE(offset + 24))

            const timestamps = [...new Set([openTsUs, closeTsUs, highTsUs, lowTsUs])].sort((a, b) => a - b)
            const firstTrade = this.#tradeStore.findTradeByTsUs(timestamps[0])
            const candle = new Candle(this.#durationSec, firstTrade)
            for (let t = 1; t < timestamps.length; t++) {
                candle.update(this.#tradeStore.findTradeByTsUs(timestamps[t]))
            }
            candles.push(candle)
        }
        return candles
    }

    async ensureDay (year, month, day) {
        if (this.hasDay(year, month, day)) return false
        await this.#tradeStore.ensureDay(year, month, day)
        const candles = this.#buildCandlesFromTrades(year, month, day)
        if (candles.length === 0) return false
        this.#saveCandles(year, month, day, candles)
        return true
    }

    async getCandles (year, month, day) {
        await this.ensureDay(year, month, day)
        return this.#loadCandles(year, month, day) || []
    }

    async * readCandles (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            const candles = await this.getCandles(cur.year, cur.month, cur.day)
            for (const candle of candles) {
                yield candle
            }
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    getCandleCount (year, month, day) {
        const file = this.#file(year, month, day)
        if (!fs.existsSync(file)) return 0
        const stats = fs.statSync(file)
        return Math.floor(stats.size / CANDLE_RECORD_SIZE)
    }
}

const nextDay = (year, month, day) => {
    const d = new Date(Date.UTC(year, month - 1, day + 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

const compareDates = (a, b) =>
    (a.year - b.year) || (a.month - b.month) || (a.day - b.day)
