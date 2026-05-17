const Trade = require('../../core/Trade')
const paths = require('./paths')

class Trades {
    static #RECORD_SIZE = 40 // 8+8+8+8+8 bytes per record
    #config /** @type {object} */
    #data /** @type {Buffer} */

    constructor (config) {
        this.#config = config
    }

    static async create (config) {
        const result = new Trades(config)
        await result.#init()
        return result
    }

    get length () {
        return this.#data.length / Trades.#RECORD_SIZE
    }

    read (tradeIndex) {
        const offset = tradeIndex * Trades.#RECORD_SIZE
        const idWithFlags = this.#data.readBigUInt64LE(offset + 0)
        const tsUs = this.#data.readBigUInt64LE(offset + 8)
        const price = this.#data.readDoubleLE(offset + 16)
        const baseQty = this.#data.readDoubleLE(offset + 24)
        const quoteQty = this.#data.readDoubleLE(offset + 32)
        const flags = Number(idWithFlags >> 62n)
        const id = idWithFlags & 0x3FFFFFFFFFFFFFFFn

        return new Trade(
            this.#config.data.exchange.name,
            this.#config.data.symbol,
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

    readBulk (startIndex, count) {
        const trades = []
        for (let i = 0; i < count; i++) {
            trades.push(this.read(startIndex + i))
        }
        return trades
    }

    async #init () {
        this.#data = await require('./readFullFile').readFullFile(paths.trades(this.#config))
    }
}

module.exports = Trades
