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

    #getFilePath (year, month, day) {
        return path.join(this.#dataDir, 'trades', this.#symbol.exchange.id, `${this.#symbol.base.id}${this.#symbol.quote.id}`, `${dateStr(year, month, day)}.bin`)
    }

    async #ensureDayAsync (year, month, day) {
        const file = this.#getFilePath(year, month, day)
        try {
            await fs.promises.access(file)
            return
        } catch {}
        const tmpFile = file + '.tmp'
        await fs.promises.mkdir(path.dirname(file), { recursive: true })
        const ws = fs.createWriteStream(tmpFile, { flags: 'w' })
        const count = await this.#symbol.exchange.downloader.downloadDay(this.#symbol, year, month, day, ws)
        await new Promise((resolve, reject) => { ws.end((err) => err ? reject(err) : resolve()) })
        await fs.promises.rename(tmpFile, file)
        console.log(`${dateStr(year, month, day)}: ${count} trades`)
    }

    async * readTradesAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDayAsync(cur.year, cur.month, cur.day)
            const file = this.#getFilePath(cur.year, cur.month, cur.day)
            const buf = await fs.promises.readFile(file).catch(() => null)
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

    async readTradesArrayAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        const result = []
        for await (const trade of this.readTradesAsync(startYear, startMonth, startDay, endYear, endMonth, endDay)) {
            result.push(trade)
        }
        return result
    }

    #fileForTsUs (tsUs) {
        const d = new Date(Math.floor(tsUs / 1000))
        return this.#getFilePath(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
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
