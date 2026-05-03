import fs from 'fs'
import path from 'path'
import Candle from '../core/Candle.js'
import { isValidDuration } from '../core/CandleDuration.js'
import Trades from './Trades.js'
import { dateStr, nextDay, compareDates } from '../utils/date.js'

const CANDLE_RECORD_SIZE = 64

export default class Candles {
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
        this.#tradeStore = new Trades(dataDir, symbol)
    }

    #dir () {
        return path.join(this.#dataDir, 'candles', this.#symbol.exchange.id,
            `${this.#symbol.base.id}${this.#symbol.quote.id}`, String(this.#durationSec))
    }

    #file (year, month, day) {
        return path.join(this.#dir(), `${dateStr(year, month, day)}.bin`)
    }

    #hasDay (year, month, day) {
        return fs.existsSync(this.#file(year, month, day))
    }

    async #buildCandlesFromTrades (year, month, day) {
        const durationUs = this.#durationSec * 1_000_000
        const candles = []
        let current = null

        for await (const trade of this.#tradeStore.readTrades(year, month, day, year, month, day)) {
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
            const off = i * CANDLE_RECORD_SIZE
            const c = candles[i]
            buf.writeBigUInt64LE(BigInt(c.open.tsUs), off)
            buf.writeBigUInt64LE(BigInt(c.open.srcId), off + 8)
            buf.writeBigUInt64LE(BigInt(c.close.tsUs), off + 16)
            buf.writeBigUInt64LE(BigInt(c.close.srcId), off + 24)
            buf.writeBigUInt64LE(BigInt(c.high.tsUs), off + 32)
            buf.writeBigUInt64LE(BigInt(c.high.srcId), off + 40)
            buf.writeBigUInt64LE(BigInt(c.low.tsUs), off + 48)
            buf.writeBigUInt64LE(BigInt(c.low.srcId), off + 56)
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
            const off = i * CANDLE_RECORD_SIZE
            const refs = [
                { tsUs: Number(buf.readBigUInt64LE(off)), srcId: Number(buf.readBigUInt64LE(off + 8)) },
                { tsUs: Number(buf.readBigUInt64LE(off + 16)), srcId: Number(buf.readBigUInt64LE(off + 24)) },
                { tsUs: Number(buf.readBigUInt64LE(off + 32)), srcId: Number(buf.readBigUInt64LE(off + 40)) },
                { tsUs: Number(buf.readBigUInt64LE(off + 48)), srcId: Number(buf.readBigUInt64LE(off + 56)) }
            ]

            const unique = [...new Map(refs.map(r => [r.tsUs, r])).values()].sort((a, b) => a.tsUs - b.tsUs)
            const firstTrade = this.#tradeStore.readTradeAt(unique[0].tsUs, unique[0].srcId)
            const candle = new Candle(this.#durationSec, firstTrade)
            for (let t = 1; t < unique.length; t++) {
                candle.update(this.#tradeStore.readTradeAt(unique[t].tsUs, unique[t].srcId))
            }
            candles.push(candle)
        }
        return candles
    }

    async #ensureDay (year, month, day) {
        if (this.#hasDay(year, month, day)) return false
        const candles = await this.#buildCandlesFromTrades(year, month, day)
        if (candles.length === 0) return false
        this.#saveCandles(year, month, day, candles)
        return true
    }

    async * readCandles (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDay(cur.year, cur.month, cur.day)
            const candles = this.#loadCandles(cur.year, cur.month, cur.day) || []
            for (const candle of candles) {
                yield candle
            }
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    async readCandlesArray (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        const result = []
        for await (const candle of this.readCandles(startYear, startMonth, startDay, endYear, endMonth, endDay)) {
            result.push(candle)
        }
        return result
    }

}
