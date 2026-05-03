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
        return path.join(this.#dataDir, 'raw', this.#symbol.exchange.id, `${this.#symbol.base.id}${this.#symbol.quote.id}`)
    }

    #file (year, month, day) {
        return path.join(this.#dir(), `${dateStr(year, month, day)}.bin`)
    }

    hasDay (year, month, day) {
        return fs.existsSync(this.#file(year, month, day))
    }

    async ensureDay (year, month, day) {
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

    async ensureRange (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.ensureDay(cur.year, cur.month, cur.day)
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    #loadDay (year, month, day) {
        const file = this.#file(year, month, day)
        if (!fs.existsSync(file)) return null
        return fs.readFileSync(file)
    }

    * readTrades (startYear, startMonth, startDay, endYear, endMonth, endDay) {
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
                    trade.srcFile = file
                    trade.srcOffset = offset
                    yield trade
                }
            }
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    readTradesArray (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        return [...this.readTrades(startYear, startMonth, startDay, endYear, endMonth, endDay)]
    }

    getTradeCount (year, month, day) {
        const file = this.#file(year, month, day)
        if (!fs.existsSync(file)) return 0
        const stats = fs.statSync(file)
        return Math.floor(stats.size / Trade.RECORD_SIZE)
    }

    getInfo (year, month, day) {
        const buf = this.#loadDay(year, month, day)
        if (!buf || buf.length < Trade.RECORD_SIZE) return null
        const count = Math.floor(buf.length / Trade.RECORD_SIZE)
        const first = Trade.fromBuffer(this.#symbol, buf, 0)
        const last = Trade.fromBuffer(this.#symbol, buf, (count - 1) * Trade.RECORD_SIZE)
        return {
            count,
            firstTsUs: first.tsUs,
            lastTsUs: last.tsUs,
            firstDate: first.date,
            lastDate: last.date
        }
    }
}
