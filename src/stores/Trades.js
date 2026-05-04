import fs from 'fs'
import Trade from '../core/Trade.js'
import FilePart from '../utils/FilePart.js'
import { dateStr, nextDay, compareDates } from '../utils/date.js'
import { getFilePath, saveFile } from '../utils/storage.js'

export default class Trades {
    #dataDir
    #symbol
    #filePart

    constructor (dataDir, symbol) {
        this.#dataDir = dataDir
        this.#symbol = symbol
        this.#filePart = null
        if (!symbol.exchange) throw new Error('Symbol must belong to an exchange')
    }

    #getFilePath (year, month, day) {
        return getFilePath(this.#dataDir, 'trades', this.#symbol, year, month, day)
    }

    async #ensureDayAsync (year, month, day) {
        const file = this.#getFilePath(year, month, day)
        try {
            await fs.promises.access(file)
            return
        } catch {}
        const chunks = []
        const ws = new (await import('stream')).Writable({
            write (chunk, encoding, callback) { chunks.push(chunk); callback() }
        })
        const count = await this.#symbol.exchange.downloader.downloadDay(this.#symbol, year, month, day, ws)
        await new Promise((resolve, reject) => { ws.end((err) => err ? reject(err) : resolve()) })
        await saveFile(file, Buffer.concat(chunks))
        console.log(`${dateStr(year, month, day)}: ${count} trades`)
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
            if (buf.length >= Trade.RECORD_SIZE) {
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

    async readArrayAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        const result = []
        for await (const trade of this.readAsync(startYear, startMonth, startDay, endYear, endMonth, endDay)) {
            result.push(trade)
        }
        return result
    }

    #fileForTsUs (tsUs) {
        const d = new Date(Math.floor(tsUs / 1000))
        return this.#getFilePath(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }

    async readAtAsync (tsUs, srcId) {
        if (srcId < 0 || srcId % Trade.RECORD_SIZE !== 0) {
            throw new Error(`Invalid srcId: ${srcId} (must be non-negative multiple of ${Trade.RECORD_SIZE})`)
        }
        const d = new Date(Math.floor(tsUs / 1000))
        await this.#ensureDayAsync(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
        const filePath = this.#fileForTsUs(tsUs)
        this.#filePart = await FilePart.createAsync({ filePart: this.#filePart, filePath })
        const buf = await this.#filePart.readAsync({ offset: srcId, length: Trade.RECORD_SIZE })
        const trade = Trade.fromBuffer(this.#symbol, srcId, buf, 0)
        if (trade.tsUs !== tsUs) {
            throw new Error(`Trade at srcId ${srcId} has tsUs=${trade.tsUs}, expected ${tsUs}`)
        }
        return trade
    }
}
