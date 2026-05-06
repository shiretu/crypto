import Store from './Store.js'
import Trade from '../core/Trade.js'
import Day from '../utils/Day.js'

export default class Trades extends Store {
    constructor (dataDir, symbol) {
        super(dataDir, symbol, 'trades', Trade.RECORD_SIZE)
    }

    async computeDay (dayTsUs) {
        const downloader = this.symbol.exchange.downloader
        if (!downloader) throw new Error(`No downloader for exchange ${this.symbol.exchange.id}`)
        return await downloader.downloadDay(this.symbol, dayTsUs)
    }

    #makeRecord (buf, offset) {
        return new Trade(buf.subarray(offset, offset + this.recordSize))
    }

    getAt (tsUs, dayIndex) {
        const dayKey = Day.fromTsUs(tsUs)
        const buf = this.buffers.get(dayKey)
        if (!buf) throw new Error(`Day not loaded for tsUs=${tsUs}`)
        const offset = dayIndex * this.recordSize
        if (offset + this.recordSize > buf.length) throw new Error(`dayIndex ${dayIndex} out of bounds (day has ${buf.length / this.recordSize} records)`)
        const record = this.#makeRecord(buf, offset)
        if (record.tsUs !== tsUs) throw new Error(`tsUs mismatch at dayIndex ${dayIndex}: expected ${tsUs}, got ${record.tsUs}`)
        return record
    }

    get (index) {
        const usPerDay = 24 * 3600 * 1_000_000
        let remaining = index
        for (let day = this.minDay; day <= this.maxDay; day += usPerDay) {
            const buf = this.buffers.get(day)
            if (!buf) continue
            const dayCount = buf.length / this.recordSize
            if (remaining < dayCount) {
                return this.#makeRecord(buf, remaining * this.recordSize)
            }
            remaining -= dayCount
        }
        throw new Error(`Index ${index} out of bounds (store has ${this.count} records)`)
    }

    findByTsUs (tsUs) {
        const dayKey = Day.fromTsUs(tsUs)
        const buf = this.buffers.get(dayKey)
        if (!buf) throw new Error(`Day not loaded for tsUs=${tsUs}`)
        const count = buf.length / this.recordSize
        let lo = 0
        let hi = count - 1
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1
            const midTsUs = this.readTsUs(buf, mid * this.recordSize)
            if (midTsUs === tsUs) return this.#makeRecord(buf, mid * this.recordSize)
            if (midTsUs < tsUs) lo = mid + 1
            else hi = mid - 1
        }
        throw new Error(`No record found for tsUs=${tsUs}`)
    }
}
