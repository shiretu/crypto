/**
 * Base class for day-file backed stores.
 * Each record type (Trade, Candle, etc.) extends this with its own RECORD_SIZE and record class.
 */
export default class Store {
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
        throw new Error('loadAsync() not implemented')
    }

    /**
     * Total number of records across all loaded day buffers
     * @returns {number}
     */
    get count () {
        throw new Error('count not implemented')
    }

    /**
     * Timestamp (microseconds) of the first record in the loaded range
     * @returns {number}
     */
    get firstTsUs () {
        throw new Error('firstTsUs not implemented')
    }

    /**
     * Timestamp (microseconds) of the last record in the loaded range
     * @returns {number}
     */
    get lastTsUs () {
        throw new Error('lastTsUs not implemented')
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
