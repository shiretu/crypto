import path from 'path'
import fs from 'fs'
import Day from '../utils/Day.js'

/**
 * Base class for day-file backed stores.
 * Each record type (Trade, Candle, etc.) extends this with its own RECORD_SIZE and record class.
 */
export default class Store {
    #dataDir
    #symbol
    #storeType
    #recordSize
    #buffers
    #minDay
    #maxDay
    #onActivity

    constructor (dataDir, symbol, storeType, recordSize) {
        this.#dataDir = dataDir
        this.#symbol = symbol
        this.#storeType = storeType
        this.#recordSize = recordSize
        this.#buffers = new Map()
        this.#minDay = null
        this.#maxDay = null
        this.#onActivity = null
    }

    get symbol () { return this.#symbol }
    get buffers () { return this.#buffers }
    get minDay () { return this.#minDay }
    get maxDay () { return this.#maxDay }
    get recordSize () { return this.#recordSize }

    readTsUs (buf, offset) {
        return Number(buf.readBigUInt64LE(offset) & 0x7FFFFFFFFFFFFFFFn)
    }

    /**
     * Register a callback for store activity events.
     * Callback receives an object with a `type` string property
     * and additional properties describing the event.
     * @param {function} cb
     */
    set onActivity (cb) { this.#onActivity = cb }

    emit (event) {
        if (this.#onActivity) this.#onActivity(event)
    }

    #dayFilePath (dayTsUs) {
        const d = new Date(dayTsUs / 1000)
        const y = String(d.getUTCFullYear())
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        return path.join(this.#dataDir,
            this.#storeType,
            this.#symbol.exchange.id,
            this.#symbol.base.id,
            this.#symbol.quote.id,
            y,
            m,
            `${dd}.bin`
        )
    }

    async #ensureDay (dayTsUs) {
        if (this.#buffers.has(dayTsUs)) return
        const filePath = this.#dayFilePath(dayTsUs)
        try {
            const buf = await fs.promises.readFile(filePath)
            this.#buffers.set(dayTsUs, buf)
            this.emit({ type: 'loaded', dayTsUs, source: 'disk', records: buf.length / this.#recordSize })
            return
        } catch (err) {
            if (err.code !== 'ENOENT') throw err
        }
        this.emit({ type: 'computing', dayTsUs })
        const buf = await this.computeDay(dayTsUs)
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await fs.promises.writeFile(filePath, buf)
        this.#buffers.set(dayTsUs, buf)
        this.emit({ type: 'loaded', dayTsUs, source: 'computed', records: buf.length / this.#recordSize })
    }

    /**
     * Load all day buffers from the day containing startTsUs through
     * and including the day containing endTsUs.
     * Can be called multiple times to extend the loaded range — already
     * loaded days are kept, only missing days are added.
     * All accessors operate on the data loaded by this call.
     * @param {number} startTsUs - timestamp (microseconds) identifying the first day to load
     * @param {number} endTsUs - timestamp (microseconds) identifying the last day to load
     */
    async loadAsync (startTsUs, endTsUs) {
        if (!Number.isFinite(startTsUs) || startTsUs < 0) throw new Error('startTsUs must be a non-negative number')
        if (!Number.isFinite(endTsUs) || endTsUs < 0) throw new Error('endTsUs must be a non-negative number')
        if (startTsUs > endTsUs) throw new Error('startTsUs must be <= endTsUs')

        const startDay = Day.fromTsUs(startTsUs)
        const endDay = Day.fromTsUs(endTsUs)
        const usPerDay = 24 * 3600 * 1_000_000

        for (let day = Math.min(startDay, this.#minDay ?? startDay);
            day <= Math.max(endDay, this.#maxDay ?? endDay);
            day += usPerDay) {
            await this.#ensureDay(day)
        }
        this.#minDay = Math.min(startDay, this.#minDay ?? startDay)
        this.#maxDay = Math.max(endDay, this.#maxDay ?? endDay)
    }

    /**
     * Compute the raw buffer for a day that is not on disk.
     * Override in subclasses that can generate data (e.g. download, derive).
     * @param {number} dayTsUs - midnight-UTC microsecond timestamp of the day
     * @returns {Promise<Buffer>}
     */
    async computeDay (dayTsUs) {
        throw new Error('computeDay() not implemented')
    }

    /**
     * Total number of records across all loaded day buffers
     * @returns {number}
     */
    get count () {
        let total = 0
        for (const buf of this.#buffers.values()) {
            total += buf.length / this.#recordSize
        }
        return total
    }

    /**
     * Timestamp (microseconds) of the first record in the loaded range
     * @returns {number}
     */
    get firstTsUs () {
        if (!this.#minDay) return null
        const buf = this.#buffers.get(this.#minDay)
        if (!buf) throw new Error(`Buffer missing for minDay ${this.#minDay}`)
        if (buf.length < this.#recordSize) return null
        return this.readTsUs(buf, 0)
    }

    /**
     * Timestamp (microseconds) of the last record in the loaded range
     * @returns {number}
     */
    get lastTsUs () {
        if (!this.#maxDay) return null
        const buf = this.#buffers.get(this.#maxDay)
        if (!buf) throw new Error(`Buffer missing for maxDay ${this.#maxDay}`)
        if (buf.length < this.#recordSize) return null
        return this.readTsUs(buf, buf.length - this.#recordSize)
    }

    /**
     * Direct access to a record by its day-relative index, verified against a known timestamp.
     * Uses tsUs to identify the day buffer, then reads the record at dayIndex.
     * Throws if the record at that index does not match the expected tsUs — this is
     * a direct access with integrity check, not a search.
     * @param {number} tsUs - timestamp (microseconds) used to locate the day buffer
     * @param {number} dayIndex - 0-based index of the record within that day's buffer
     * @returns {object}
     * @throws {Error} if the record at dayIndex has a different tsUs
     */
    getAt (tsUs, dayIndex) {
        throw new Error('getAt() not implemented')
    }

    /**
     * Get a record by its sequential index across all loaded days
     * @param {number} index
     * @returns {object}
     */
    get (index) {
        throw new Error('get() not implemented')
    }

    /**
     * Binary search for a record by timestamp
     * @param {number} tsUs
     * @returns {object}
     */
    findByTsUs (tsUs) {
        throw new Error('findByTsUs() not implemented')
    }
}
