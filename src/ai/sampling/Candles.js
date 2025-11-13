const CandlesGenerator = require('../../core/CandlesGenerator')
const { cache } = require('./Cache')
const cliProgress = require('cli-progress')
const paths = require('./paths')
const path = require('path')
const Candle = require('../../core/Candle')
const { readFullFile } = require('./readFullFile')
const fs = require('fs').promises

class Candles {
    #config /** @type {object} */
    #trades /** @type {object} */
    #data /** @type {Uint32Array} */

    constructor (config) {
        this.#config = config
    }

    static async create (config) {
        const result = new Candles(config)
        await result.#init()
        return result
    }

    get length () {
        return this.#data.length / 2
    }

    read (index) {
        const startTradeIndex = this.#data[index * 2]
        const tradesCount = this.#data[index * 2 + 1]
        return {
            startTradeIndex,
            tradesCount,
            candle: Candle.createFromTrades(
                this.#config.data.exchange.name,
                this.#config.data.symbol,
                this.#config.candle.periodSec * 1000000,
                this.#trades.readBulk(startTradeIndex, tradesCount)
            )
        }
    }

    readBulk (firstCandleIndex, count) {
        const candlesInfo = []
        for (let i = 0; i < count; i++) {
            candlesInfo.push(this.read(firstCandleIndex + i))
        }
        const firstTradeIndex = candlesInfo[0].startTradeIndex
        const tradesCount = candlesInfo.reduce((sum, info) => sum + info.tradesCount, 0)
        return {
            firstCandleIndex,
            firstTradeIndex,
            tradesCount,
            nextTradeIndex: firstTradeIndex + tradesCount,
            candles: candlesInfo.map(info => info.candle)
        }
    }

    find (compareFn) {
        let left = 0
        let right = this.length - 1

        while (left <= right) {
            const mid = Math.floor((left + right) / 2)
            const candleInfo = this.read(mid)
            const comparison = compareFn(candleInfo.candle)

            // exact match?
            if (comparison === 0) { return mid }

            // end of the rope?
            if (right === left + 1) {
                const leftCandle = this.read(left).candle
                const rightCandle = this.read(right).candle
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
        try {
            await this.#load()
        } catch (err) {
            await this.#generate()
            await this.#load()
        }
    }

    async #load () {
        this.#trades = await cache.trades(this.#config)
        const buf = await readFullFile(paths.candles(this.#config))
        this.#data = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
    }

    async #generate () {
        const trades = await cache.trades(this.#config)
        const candlesGenerator = new CandlesGenerator(null, this.#config.data.exchange.name, this.#config.data.symbol, this.#config.candle.periodSec / 60)
        const candles = []

        const bar = new cliProgress.SingleBar()
        console.log('Generating candles ...')
        bar.start(trades.length, 0)
        for (let i = 0; i < trades.length; i++) {
            const trade = trades.read(i)
            const candle = candlesGenerator.feed(trade)
            if (candle) {
                candles.push(i - candle.tradeCount)
                candles.push(candle.tradeCount)
            }
            bar.update(i + 1)
        }
        bar.stop()
        const data = new Uint32Array(candles)
        const buf = Buffer.from(data.buffer)
        const filePath = paths.candles(this.#config)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, buf)
    }
}

module.exports = Candles
