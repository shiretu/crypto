import fs from 'fs'
import path from 'path'
import Trade from '../core/Trade.js'
import { dateStr, nextDay, compareDates } from '../utils/date.js'

export default class Trades {
    #dataDir
    #symbol

    constructor (dataDir, symbol) {
        this.#dataDir = dataDir
        this.#symbol = symbol
        if (!symbol.exchange) throw new Error('Symbol must belong to an exchange')
    }

    #dir () {
        return path.join(this.#dataDir, 'trades', this.#symbol.exchange.id, `${this.#symbol.base.id}${this.#symbol.quote.id}`)
    }

    #file (year, month, day) {
        return path.join(this.#dir(), `${dateStr(year, month, day)}.bin`)
    }

    #hasDay (year, month, day) {
        return fs.existsSync(this.#file(year, month, day))
    }

    async #ensureDay (year, month, day) {
        const file = this.#file(year, month, day)
        if (this.#hasDay(year, month, day)) return false

        fs.mkdirSync(path.dirname(file), { recursive: true })
        const ws = fs.createWriteStream(file)
        try {
            const count = await this.#symbol.exchange.downloader.downloadDay(this.#symbol, year, month, day, ws)
            await new Promise((resolve, reject) => ws.end((err) => err ? reject(err) : resolve()))
            if (count > 0) console.log(`${dateStr(year, month, day)}: ${count} trades`)
            return count > 0
        } catch (err) {
            await new Promise((resolve) => ws.end(resolve))
            if (fs.existsSync(file)) fs.unlinkSync(file)
            throw err
        }
    }

    async #ensureRange (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDay(cur.year, cur.month, cur.day)
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    #loadDay (year, month, day) {
        const file = this.#file(year, month, day)
        if (!fs.existsSync(file)) return null
        return fs.readFileSync(file)
    }

    async * readTrades (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        await this.#ensureRange(startYear, startMonth, startDay, endYear, endMonth, endDay)
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            const buf = this.#loadDay(cur.year, cur.month, cur.day)
            if (buf && buf.length >= Trade.RECORD_SIZE) {
                const count = Math.floor(buf.length / Trade.RECORD_SIZE)
                for (let i = 0; i < count; i++) {
                    const offset = i * Trade.RECORD_SIZE
                    const trade = Trade.fromBuffer(this.#symbol, offset, buf, offset)
                    yield trade
                }
            }
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    async readTradesArray (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        const result = []
        for await (const trade of this.readTrades(startYear, startMonth, startDay, endYear, endMonth, endDay)) {
            result.push(trade)
        }
        return result
    }

    #fileForTsUs (tsUs) {
        const d = new Date(Math.floor(tsUs / 1000))
        return this.#file(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }

    findTradeByTsUs (tsUs) {
        const filePath = this.#fileForTsUs(tsUs)
        const buf = fs.readFileSync(filePath)
        if (!buf || buf.length < Trade.RECORD_SIZE) throw new Error(`No trade data for ${filePath}`)
        const count = Math.floor(buf.length / Trade.RECORD_SIZE)
        let lo = 0
        let hi = count - 1
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1
            const offset = mid * Trade.RECORD_SIZE
            const midTsUs = Number(buf.readBigUInt64LE(offset) & 0x3FFFFFFFFFFFFFFFn)
            if (midTsUs === tsUs) {
                const trade = Trade.fromBuffer(this.#symbol, offset, buf, offset)
                return trade
            }
            if (midTsUs < tsUs) lo = mid + 1
            else hi = mid - 1
        }
        throw new Error(`Trade not found for tsUs=${tsUs}`)
    }

    readTradeAt (tsUs, srcId) {
        if (srcId < 0 || srcId % Trade.RECORD_SIZE !== 0) {
            throw new Error(`Invalid srcId: ${srcId} (must be non-negative multiple of ${Trade.RECORD_SIZE})`)
        }
        const filePath = this.#fileForTsUs(tsUs)
        const fileSize = fs.statSync(filePath).size
        if (srcId + Trade.RECORD_SIZE > fileSize) {
            throw new Error(`srcId ${srcId} out of bounds (file size: ${fileSize})`)
        }
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        const fd = fs.openSync(filePath, 'r')
        try {
            fs.readSync(fd, buf, 0, Trade.RECORD_SIZE, srcId)
        } finally {
            fs.closeSync(fd)
        }
        const trade = Trade.fromBuffer(this.#symbol, srcId, buf, 0)
        if (trade.tsUs !== tsUs) {
            throw new Error(`Trade at srcId ${srcId} has tsUs=${trade.tsUs}, expected ${tsUs}`)
        }
        return trade
    }
}
