const { read } = require('fs')
const CandlesGenerator = require('../../src/core/CandlesGenerator')
const BinanceRawReader = require('../../src/sources/BinanceRawReader')
const fs = require('fs').promises
const cliProgress = require('cli-progress')
const Candle = require('../../src/core/Candle')

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

    async #init () {
        const mapFilePath = this.#config.tradesBinaryFilePath.replace('_trades.bin', `_candles_map_${this.#config.candleDurationMinutes}min.bin`)
        const fileExists = await fs.access(mapFilePath).then(() => true).catch(() => false)
        if (fileExists) {
            const buf = await fs.readFile(mapFilePath)
            this.#data = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
            return
        }
        const candlesMap = []
        const brr = BinanceRawReader.create(this.#config.tradesBinaryFilePath, this.#config.symbol)
        const candlesGenerator = new CandlesGenerator(null, this.#config.exchangeName, this.#config.symbol, this.#config.candleDurationMinutes)
        const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
        console.log('Generating candles map...')
        bar.start(brr.info.recordsCount, 0)
        for (let i = 0; i < brr.info.recordsCount; i++) {
            if ((i % 10000) === 0) { bar.update(i + 1) }
            const trade = brr.readTrade(i)
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
