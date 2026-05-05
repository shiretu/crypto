import fs from 'fs'
import Trade from '../core/Trade.js'
import CachedFile from '../utils/CachedFile.js'
import { dateStr, nextDay, compareDates } from '../utils/Day.js'
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

    #getFilePath (date) {
        return getFilePath(this.#dataDir, 'trades', this.#symbol, date)
    }

    async #ensureDayAsync (date) {
        const file = this.#getFilePath(date)
        try {
            await fs.promises.access(file)
            return
        } catch {}
        const chunks = []
        const ws = new (await import('stream')).Writable({
            write (chunk, encoding, callback) { chunks.push(chunk); callback() }
        })
        const count = await this.#symbol.exchange.downloader.downloadDay(this.#symbol, date.year, date.month, date.day, ws)
        await new Promise((resolve, reject) => { ws.end((err) => err ? reject(err) : resolve()) })
        await saveFile(file, Buffer.concat(chunks))
        console.log(`${dateStr(date)}: ${count} trades`)
    }

    async fetchAsync (start, end) {
        let cur = start
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDayAsync(cur)
            cur = nextDay(cur)
        }
    }

    async * readAsync (start, end) {
        let cur = start
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDayAsync(cur)
            const filePath = this.#getFilePath(cur)
            this.#filePart = await CachedFile.createAsync({ filePart: this.#filePart, filePath })
            const buf = await this.#filePart.readAsync({})
            if (buf.length >= Trade.RECORD_SIZE) {
                const count = Math.floor(buf.length / Trade.RECORD_SIZE)
                for (let i = 0; i < count; i++) {
                    const offset = i * Trade.RECORD_SIZE
                    const trade = Trade.fromBuffer(this.#symbol, offset, buf, offset)
                    yield trade
                }
            }
            cur = nextDay(cur)
        }
    }

    async readArrayAsync (start, end) {
        const result = []
        for await (const trade of this.readAsync(start, end)) {
            result.push(trade)
        }
        return result
    }

    #dateForTsUs (tsUs) {
        const d = new Date(Math.floor(tsUs / 1000))
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }

    async readAtAsync (tsUs, srcId) {
        if (srcId < 0 || srcId % Trade.RECORD_SIZE !== 0) {
            throw new Error(`Invalid srcId: ${srcId} (must be non-negative multiple of ${Trade.RECORD_SIZE})`)
        }
        const date = this.#dateForTsUs(tsUs)
        await this.#ensureDayAsync(date)
        const filePath = this.#getFilePath(date)
        this.#filePart = await CachedFile.createAsync({ filePart: this.#filePart, filePath })
        const buf = await this.#filePart.readAsync({ offset: srcId, length: Trade.RECORD_SIZE })
        const trade = Trade.fromBuffer(this.#symbol, srcId, buf, 0)
        if (trade.tsUs !== tsUs) {
            throw new Error(`Trade at srcId ${srcId} has tsUs=${trade.tsUs}, expected ${tsUs}`)
        }
        return trade
    }
}
