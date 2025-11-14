const fs = require('fs').promises

const { progressBar } = require('../ai/common/progressBar')
const Candle = require('../core/Candle')
const CandlesGenerator = require('../core/CandlesGenerator')
const BinanceRawReader = require('./BinanceRawReader')

class CandlesMap {
    #config /** @type {object} */
    #data /** @type {Uint32Array} */

    /**
     * Create a CandlesMap instance
     * @param {*} config
     */
    constructor (config) {
        this.#config = config
    }

    /**
     * Create a CandlesMap instance
     * @param {*} config
     * @returns {Promise<CandlesMap>}
     */
    static async create (config) {
        const result = new CandlesMap(config)
        await result.#init()
        return result
    }

    /**
     * Get the number of candles in the map
     * @returns {number}
     */
    get length () {
        return this.#data.length / 2
    }

    /**
     * Get a candle from the map
     * @param {BinanceRawReader} reader
     * @param {number} index
     * @returns {Candle}
     */
    get (reader, index) {
        if (index < 0 || index >= this.length) {
            throw new Error(`Index out of bounds: ${index}`)
        }
        const startTradeIndex = this.#data[index * 2]
        const tradesCount = this.#data[index * 2 + 1]
        return {
            startTradeIndex,
            tradesCount,
            candle: Candle.createFromTrades(
                this.#config.exchangeName,
                this.#config.symbol,
                this.#config.candleDurationMinutes * 60 * 1000000,
                reader.readBulkTrades(startTradeIndex, tradesCount)
            )
        }
    }

    bulkGet (reader, firstCandleIndex, count) {
        const candlesInfo = []
        for (let i = 0; i < count; i++) {
            candlesInfo.push(this.get(reader, firstCandleIndex + i))
        }
        const firstTradeIndex = candlesInfo[0].startTradeIndex
        const tradesCount = candlesInfo.reduce((sum, info) => sum + info.tradesCount, 0)
        return {
            firstCandleIndex,
            firstTradeIndex,
            tradesCount,
            candles: candlesInfo.map(info => info.candle)
        }
    }

    /**
     * Binary search to find an index based on a comparison function
     * @param {BinanceRawReader} reader
     * @param {function(Candle): number} compareFn - Returns -1 if too soon, 0 if exact, 1 if too late
     * @returns {number} The index found (exact match or lower bound if not found)
     */
    findIndex (reader, compareFn) {
        if (this.length === 0) {
            throw new Error('CandlesMap is empty')
        }
        let left = 0
        let right = this.length - 1

        while (left <= right) {
            const mid = Math.floor((left + right) / 2)
            const candleInfo = this.get(reader, mid)
            const comparison = compareFn(candleInfo.candle)

            // exact match?
            if (comparison === 0) { return mid }

            // end of the rope?
            if (right === left + 1) {
                const leftCandle = this.get(reader, left).candle
                const rightCandle = this.get(reader, right).candle
                const leftDiff = Math.abs(compareFn(leftCandle))
                const rightDiff = Math.abs(compareFn(rightCandle))
                return leftDiff <= rightDiff ? left : right
            }

            // re-adjust
            if (comparison < 0) {
                left = mid
            } else {
                right = mid
            }
        }

        // This should never be reached due to the "end of rope" check above
        throw new Error('Binary search logic error: loop exited unexpectedly')
    }

    async #init () {
        const mapFilePath = this.#config.tradesDataPath.replace('_trades.bin', `_candles_map_${this.#config.candleDurationMinutes}min.bin`)
        const fileExists = await fs.access(mapFilePath).then(() => true).catch(() => false)
        if (fileExists) {
            const buf = await fs.readFile(mapFilePath)
            this.#data = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
            return
        }
        const candlesMap = []
        const candlesGenerator = new CandlesGenerator(null, this.#config.exchangeName, this.#config.symbol, this.#config.candleDurationMinutes)
        const bar = progressBar('Generating candles map...')
        bar.start(this.#config.tradesReader.info.recordsCount, 0)
        for (let i = 0; i < this.#config.tradesReader.info.recordsCount; i++) {
            if ((i % 10000) === 0) { bar.update(i + 1) }
            const trade = this.#config.tradesReader.readTrade(i)
            const candle = candlesGenerator.feed(trade)
            if (candle) {
                candlesMap.push(i - candle.tradeCount)
                candlesMap.push(candle.tradeCount)
            }
        }
        bar.stop()
        this.#data = new Uint32Array(candlesMap)
        const buf = Buffer.from(this.#data.buffer)
        await fs.writeFile(mapFilePath, buf)
    }
}
module.exports = CandlesMap
