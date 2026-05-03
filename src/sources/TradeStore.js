import fs from 'fs'
import path from 'path'
import Trade from '../core/Trade.js'

const dateStr = (year, month, day) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const nextDay = (year, month, day) => {
    const d = new Date(Date.UTC(year, month - 1, day + 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

const compareDates = (a, b) =>
    (a.year - b.year) || (a.month - b.month) || (a.day - b.day)

export default class TradeStore {
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
        if (fs.existsSync(file)) return false

        fs.mkdirSync(path.dirname(file), { recursive: true })
        const ws = fs.createWriteStream(file)
        try {
            const count = await this.#symbol.exchange.downloader.downloadDay(this.#symbol, year, month, day, ws)
            await new Promise((resolve, reject) => ws.end((err) => err ? reject(err) : resolve()))
            if (count === 0) {
                fs.unlinkSync(file)
                return false
            }
            console.log(`${dateStr(year, month, day)}: ${count} trades`)
            return true
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
            const file = this.#file(cur.year, cur.month, cur.day)
            const buf = this.#loadDay(cur.year, cur.month, cur.day)
            if (buf && buf.length >= Trade.RECORD_SIZE) {
                const count = Math.floor(buf.length / Trade.RECORD_SIZE)
                for (let i = 0; i < count; i++) {
                    const offset = i * Trade.RECORD_SIZE
                    const trade = Trade.fromBuffer(this.#symbol, buf, offset)
                    trade.srcId = offset
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
                const trade = Trade.fromBuffer(this.#symbol, buf, offset)
                trade.srcId = offset
                return trade
            }
            if (midTsUs < tsUs) lo = mid + 1
            else hi = mid - 1
        }
        throw new Error(`Trade not found for tsUs=${tsUs}`)
    }

    readTradeAt (tsUs, srcId) {
        const filePath = this.#fileForTsUs(tsUs)
        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
        const fd = fs.openSync(filePath, 'r')
        try {
            fs.readSync(fd, buf, 0, Trade.RECORD_SIZE, srcId)
        } finally {
            fs.closeSync(fd)
        }
        const trade = Trade.fromBuffer(this.#symbol, buf, 0)
        trade.srcId = srcId
        return trade
    }
}
