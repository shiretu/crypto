import fs from 'fs'
import path from 'path'
import Candle from '../core/Candle.js'
import { isValidDuration } from '../core/candleDuration.js'
import Trades from './Trades.js'
import FilePart from '../utils/FilePart.js'
import { dateStr, nextDay, compareDates } from '../utils/date.js'
import { getFilePath, saveFile } from '../utils/storage.js'

const CANDLE_RECORD_SIZE = 64

export default class Candles {
    #dataDir
    #symbol
    #durationSec
    #tradeStore
    #filePart

    constructor (dataDir, symbol, durationSec) {
        if (!isValidDuration(durationSec)) throw new Error(`Invalid candle duration: ${durationSec}`)
        if (!symbol.exchange) throw new Error('Symbol must belong to an exchange')
        this.#dataDir = dataDir
        this.#symbol = symbol
        this.#durationSec = durationSec
        this.#tradeStore = new Trades(dataDir, symbol)
        this.#filePart = null
    }

    #getFilePath (year, month, day) {
        return getFilePath(this.#dataDir, 'candles', this.#symbol, year, month, day, this.#durationSec)
    }

    async #ensureDayAsync (year, month, day) {
        const file = this.#getFilePath(year, month, day)
        try {
            await fs.promises.access(file)
            return
        } catch {}
        const durationUs = this.#durationSec * 1_000_000
        const candles = []
        let current = null
        for await (const trade of this.#tradeStore.readAsync(year, month, day, year, month, day)) {
            const idx = Math.floor(trade.tsUs / durationUs)
            if (!current || current.index !== idx) {
                if (current) candles.push(current)
                current = new Candle(this.#durationSec, trade)
            } else {
                current.update(trade)
            }
        }
        if (current) candles.push(current)

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
        await saveFile(file, buf)
    }

    async fetchAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDayAsync(cur.year, cur.month, cur.day)
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    async * readAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDayAsync(cur.year, cur.month, cur.day)
            const filePath = this.#getFilePath(cur.year, cur.month, cur.day)
            this.#filePart = await FilePart.createAsync({ filePart: this.#filePart, filePath })
            const buf = await this.#filePart.readAsync({})
            if (buf.length >= CANDLE_RECORD_SIZE) {
                const count = Math.floor(buf.length / CANDLE_RECORD_SIZE)
                for (let i = 0; i < count; i++) {
                    const off = i * CANDLE_RECORD_SIZE
                    const refs = [
                        { tsUs: Number(buf.readBigUInt64LE(off)), srcId: Number(buf.readBigUInt64LE(off + 8)) },
                        { tsUs: Number(buf.readBigUInt64LE(off + 16)), srcId: Number(buf.readBigUInt64LE(off + 24)) },
                        { tsUs: Number(buf.readBigUInt64LE(off + 32)), srcId: Number(buf.readBigUInt64LE(off + 40)) },
                        { tsUs: Number(buf.readBigUInt64LE(off + 48)), srcId: Number(buf.readBigUInt64LE(off + 56)) }
                    ]
                    const unique = [...new Map(refs.map(r => [r.tsUs, r])).values()].sort((a, b) => a.tsUs - b.tsUs)
                    const firstTrade = await this.#tradeStore.readAtAsync(unique[0].tsUs, unique[0].srcId)
                    const candle = new Candle(this.#durationSec, firstTrade)
                    for (let t = 1; t < unique.length; t++) {
                        candle.update(await this.#tradeStore.readAtAsync(unique[t].tsUs, unique[t].srcId))
                    }
                    yield candle
                }
            }
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    async readArrayAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        const result = []
        for await (const candle of this.readAsync(startYear, startMonth, startDay, endYear, endMonth, endDay)) {
            result.push(candle)
        }
        return result
    }
}
