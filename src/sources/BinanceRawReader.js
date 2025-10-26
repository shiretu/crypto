const fs = require('fs')
const Trade = require('../core/Trade')

class BinanceRawReader {
    static #RECORD_SIZE = 40 // 8+8+8+8+8 bytes per record
    static #allFiles = new Map()
    #filePath /* @type {string} */
    #symbol /* @type {Symbol} */
    #info = null /* @type {{filePath: string, fileSize: number, startTimestampUs: number, endTimestampUs: number, recordsCount: number}} */
    #allDataBuffer = null /* @type {Buffer} */

    constructor (filePath, symbol) {
        this.#filePath = filePath
        this.#symbol = symbol
    }

    /**
    * Create an instance of BinanceRawReader
    * @param {string} filePath
    * @param {Symbol} symbol
    * @returns {BinanceRawReader}
    */
    static create (filePath, symbol) {
        const result = new BinanceRawReader(filePath, symbol)
        result.#init()
        return result
    }

    /**
     * Get info about the binary trade file
     * @returns {{filePath: string, fileSize: number, startTimestampUs: number, endTimestampUs: number, recordsCount: number}}
     */
    get info () {
        return this.#info
    }

    /**
     * Read a trade record from the binary file
     * @param {number} tradeIndex
     * @returns {Trade}
     */
    readTrade (tradeIndex) {
        if (tradeIndex < 0 || tradeIndex >= this.#info.recordsCount) {
            throw new Error(`Record index out of bounds: ${tradeIndex}`)
        }
        const offset = tradeIndex * BinanceRawReader.#RECORD_SIZE
        const idWithFlags = this.#allDataBuffer.readBigUInt64LE(offset + 0)
        const tsUs = this.#allDataBuffer.readBigUInt64LE(offset + 8)
        const price = this.#allDataBuffer.readDoubleLE(offset + 16)
        const baseQty = this.#allDataBuffer.readDoubleLE(offset + 24)
        const quoteQty = this.#allDataBuffer.readDoubleLE(offset + 32)
        const flags = Number(idWithFlags >> 62n)
        const id = idWithFlags & 0x3FFFFFFFFFFFFFFFn

        return new Trade(
            'binance',
            this.#symbol,
            null,
            Number(id),
            null,
            Number(tsUs),
            Number(price),
            Number(baseQty),
            Number(quoteQty),
            (flags & 0x01) === 1
        )
    }

    /**
     * Get info about the binary trade file
     * @param {string} filePath
     * @returns {{fileSize: number, startTimestampUs: number, endTimestampUs: number, recordsCount: number}}
     */
    #init () {
        if (this.#info) {
            return this.#info
        }
        // Check if file exists
        if (!fs.existsSync(this.#filePath)) {
            throw new Error(`Binary file not found: ${this.#filePath}`)
        }

        // Get file stats
        const stats = fs.statSync(this.#filePath)
        const fileSize = stats.size
        const recordsCount = Math.floor(fileSize / BinanceRawReader.#RECORD_SIZE)

        if (recordsCount === 0) {
            throw new Error('Binary file is invalid')
        }

        this.#allDataBuffer = (() => {
            if (BinanceRawReader.#allFiles.has(this.#filePath)) {
                return BinanceRawReader.#allFiles.get(this.#filePath)
            }

            const fd = fs.openSync(this.#filePath, 'r')
            if (!fd) {
                throw new Error(`Failed to open file: ${this.#filePath}`)
            }

            try {
                console.log(`Reading ${fileSize} bytes into memory...`)
                const allDataBuffer = Buffer.allocUnsafe(fileSize)

                // Read in chunks due to fs.readSync size limitations (~600MB max)
                const chunkSize = 100 * 1024 * 1024 // 100MB chunks
                let totalBytesRead = 0
                let fileOffset = 0

                while (totalBytesRead < fileSize) {
                    const remainingBytes = fileSize - totalBytesRead
                    const currentChunkSize = Math.min(chunkSize, remainingBytes)

                    const bytesRead = fs.readSync(fd, allDataBuffer, totalBytesRead, currentChunkSize, fileOffset)
                    totalBytesRead += bytesRead
                    fileOffset += bytesRead

                    if (bytesRead !== currentChunkSize) {
                        throw new Error(`Expected to read ${currentChunkSize} bytes, but got ${bytesRead} at file offset ${fileOffset - bytesRead}`)
                    }

                    // Progress update every 500MB
                    if (totalBytesRead % (500 * 1024 * 1024) === 0 || totalBytesRead === fileSize) {
                        const progress = ((totalBytesRead / fileSize) * 100).toFixed(1)
                        console.log(`Read progress: ${totalBytesRead}/${fileSize} (${progress}%)`)
                    }
                }

                console.log(`Successfully read all ${totalBytesRead} bytes`)

                // Debug: Check first few bytes
                console.log('First 16 bytes:', allDataBuffer.subarray(0, 16).toString('hex'))

                // Debug: Check middle bytes
                const midPoint = Math.floor(fileSize / 2)
                console.log('Middle 16 bytes:', allDataBuffer.subarray(midPoint, midPoint + 16).toString('hex'))

                BinanceRawReader.#allFiles.set(this.#filePath, allDataBuffer)
                return allDataBuffer
            } finally {
                fs.closeSync(fd)
            }
        })()

        this.#info = {
            filePath: this.#filePath,
            fileSize,
            recordsCount
        }

        this.#info.startTimestampUs = Number(this.readTrade(0).tsUs)
        this.#info.endTimestampUs = Number(this.readTrade(recordsCount - 1).tsUs)
    }
}

module.exports = BinanceRawReader
