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
    #extraPathComponents
    #count
    #firstTsUs
    #lastTsUs

    constructor (dataDir, symbol, storeType, recordSize, extraPathComponents = []) {
        this.#dataDir = dataDir
        this.#symbol = symbol
        this.#storeType = storeType
        this.#recordSize = recordSize
        this.#buffers = new Map()
        this.#extraPathComponents = extraPathComponents
        this.#minDay = null
        this.#maxDay = null
        this.#onActivity = null
        this.#count = 0
        this.#firstTsUs = null
        this.#lastTsUs = null
    }

    get dataDir () { return this.#dataDir }
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
            ...this.#extraPathComponents,
            y,
            m,
            `${dd}.bin`
        )
    }

    /**
     * Get the record count for a day without loading the data.
     * Reads the file size and divides by record size.
     * @param {number} dayTsUs - midnight-UTC microsecond timestamp
     * @returns {number} record count, or 0 if file doesn't exist
     */
    async getRecordCount (dayTsUs) {
        const filePath = this.#dayFilePath(dayTsUs)
        try {
            const stat = await fs.promises.stat(filePath)
            return stat.size / this.#recordSize
        } catch (err) {
            if (err.code === 'ENOENT') return 0
            throw err
        }
    }

    async #ensureDay (dayTsUs) {
        if (this.#buffers.has(dayTsUs)) return
        const filePath = this.#dayFilePath(dayTsUs)
        let buf, source
        try {
            this.emit({ type: 'readFile', filePath })
            buf = await fs.promises.readFile(filePath)
            source = 'disk'
        } catch (err) {
            if (err.code !== 'ENOENT') throw err
            this.emit({ type: 'computing', dayTsUs })
            buf = await this.computeDayBuffer(dayTsUs)
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
            await fs.promises.writeFile(filePath, buf)
            source = 'computed'
        }
        const count = buf.length / this.#recordSize
        this.#buffers.set(dayTsUs, { buffer: buf, day: dayTsUs, count, absoluteStartIndex: 0, filePath })
        this.emit({ type: 'loaded', dayTsUs, source, records: count })
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

        for (let day = Math.min(startDay, this.#minDay ?? startDay);
            day <= Math.max(endDay, this.#maxDay ?? endDay);
            day += Day.usPerDay) {
            await this.#ensureDay(day)
        }
        this.#minDay = Math.min(startDay, this.#minDay ?? startDay)
        this.#maxDay = Math.max(endDay, this.#maxDay ?? endDay)
        this.#reindex()
    }

    #reindex () {
        let index = 0
        for (let day = this.#minDay; day <= this.#maxDay; day += Day.usPerDay) {
            const entry = this.#buffers.get(day)
            if (!entry) continue
            entry.absoluteStartIndex = index
            index += entry.count
        }
        this.#count = index

        const minEntry = this.#buffers.get(this.#minDay)
        this.#firstTsUs = minEntry && minEntry.count > 0 ? this.readTsUs(minEntry.buffer, 0) : null

        const maxEntry = this.#buffers.get(this.#maxDay)
        this.#lastTsUs = maxEntry && maxEntry.count > 0 ? this.readTsUs(maxEntry.buffer, maxEntry.buffer.length - this.#recordSize) : null
    }

    /**
     * Compute the raw buffer for a day that is not on disk.
     * Override in subclasses that can generate data (e.g. download, derive).
     * @param {number} dayTsUs - midnight-UTC microsecond timestamp of the day
     * @returns {Promise<Buffer>}
     */
    async computeDayBuffer (dayTsUs) {
        throw new Error('computeDayBuffer() not implemented')
    }

    /**
     * Total number of records across all loaded day buffers
     * @returns {number}
     */
    get count () { return this.#count }

    /**
     * Timestamp (microseconds) of the first record in the loaded range
     * @returns {number}
     */
    get firstTsUs () { return this.#firstTsUs }

    /**
     * Timestamp (microseconds) of the last record in the loaded range
     * @returns {number}
     */
    get lastTsUs () { return this.#lastTsUs }

    /**
     * Create a record from a buffer subarray. Override in subclasses.
     * @param {Buffer} buf - the day buffer
     * @param {number} offset - byte offset within the buffer
     * @param {number} dayIndex - 0-based index within the day
     * @param {number} absoluteIndex - global index across all loaded days
     * @returns {object}
     */
    makeRecord (buf, offset, dayIndex, absoluteIndex) {
        throw new Error('makeRecord() not implemented')
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
        const dayKey = Day.fromTsUs(tsUs)
        const entry = this.#buffers.get(dayKey)
        if (!entry) throw new Error(`Day not loaded for tsUs=${tsUs}`)
        if (dayIndex >= entry.count) throw new Error(`dayIndex ${dayIndex} out of bounds (day has ${entry.count} records)`)
        const offset = dayIndex * this.#recordSize
        const record = this.makeRecord(entry.buffer, offset, dayIndex, entry.absoluteStartIndex + dayIndex)
        if (record.tsUs !== tsUs) throw new Error(`tsUs mismatch at dayIndex ${dayIndex}: expected ${tsUs}, got ${record.tsUs}`)
        return record
    }

    /**
     * Get a record by its absolute index across all loaded days
     * @param {number} absoluteIndex
     * @returns {object}
     */
    get (absoluteIndex) {
        const entry = this.#buffers.values().find(e => absoluteIndex >= e.absoluteStartIndex && absoluteIndex < e.absoluteStartIndex + e.count)
        if (!entry) throw new Error(`Index ${absoluteIndex} out of bounds (store has ${this.#count} records)`)
        const dayIndex = absoluteIndex - entry.absoluteStartIndex
        return this.makeRecord(entry.buffer, dayIndex * this.#recordSize, dayIndex, absoluteIndex)
    }

    getDay (tsUs) {
        const dayKey = Day.fromTsUs(tsUs)
        const entry = this.#buffers.get(dayKey)
        if (!entry) throw new Error(`Day not loaded for tsUs=${tsUs}`)
        return Array.from({ length: entry.count }, (_, i) => this.makeRecord(entry.buffer, i * this.#recordSize, i, entry.absoluteStartIndex + i))
    }

    /**
     * Binary search for a record by timestamp
     * @param {number} tsUs
     * @returns {object}
     */
    findByTsUs (tsUs) {
        const dayKey = Day.fromTsUs(tsUs)
        const entry = this.#buffers.get(dayKey)
        if (!entry) throw new Error(`Day not loaded for tsUs=${tsUs}`)
        let lo = 0
        let hi = entry.count - 1
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1
            const midTsUs = this.readTsUs(entry.buffer, mid * this.#recordSize)
            if (midTsUs === tsUs) return this.makeRecord(entry.buffer, mid * this.#recordSize, mid, entry.absoluteStartIndex + mid)
            if (midTsUs < tsUs) lo = mid + 1
            else hi = mid - 1
        }
        throw new Error(`No record found for tsUs=${tsUs}`)
    }

    toAnonymousObject () {
        return {
            dataDir: this.#dataDir,
            symbolId: this.#symbol.id,
            storeType: this.#storeType,
            recordSize: this.#recordSize,
            buffers: this.#buffers,
            minDay: this.#minDay,
            maxDay: this.#maxDay,
            extraPathComponents: this.#extraPathComponents,
            count: this.#count,
            firstTsUs: this.#firstTsUs,
            lastTsUs: this.#lastTsUs
        }
    }

    _restoreFrom (obj) {
        this.#buffers = obj.buffers
        this.#buffers.forEach(entry => { entry.buffer = Buffer.from(entry.buffer.buffer, entry.buffer.byteOffset, entry.buffer.byteLength) })
        this.#minDay = obj.minDay
        this.#maxDay = obj.maxDay
        this.#count = obj.count
        this.#firstTsUs = obj.firstTsUs
        this.#lastTsUs = obj.lastTsUs
    }
}
