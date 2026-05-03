import https from 'https'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import { parse } from 'csv-parse'
import unzipper from 'unzipper'
import Exchange from '../core/Exchange.js'
import Symbol from '../core/Symbol.js'
import { getAsset } from '../core/assets.js'
import Trade from '../core/Trade.js'

class BinanceDownloader {
    #baseUrl = 'https://data.binance.vision/data/spot/daily/trades'

    #formatSymbol (symbol) {
        return `${symbol.base.id}${symbol.quote.id}`.toUpperCase()
    }

    async downloadDay (symbol, year, month, day, writeStream) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

        if (new Date(date) >= new Date()) return 0

        const name = this.#formatSymbol(symbol)
        const url = `${this.#baseUrl}/${name}/${name}-trades-${date}.zip`
        const csvStream = await this.#fetchZipCsv(url)
        if (!csvStream) return 0

        return await this.#csvToBinary(csvStream, writeStream)
    }

    async #csvToBinary (csvStream, writeStream) {
        let count = 0
        let lastTsUs = -1

        const csvParser = parse({ relax_column_count: true })

        const toBinary = new Transform({
            objectMode: true,
            transform (record, encoding, callback) {
                if (record.length < 6) return callback()

                const price = parseFloat(record[1])
                const baseQty = parseFloat(record[2])
                const quoteQty = parseFloat(record[3])
                const rawTs = parseInt(record[4])
                if (isNaN(price) || isNaN(baseQty) || isNaN(quoteQty) || isNaN(rawTs)) return callback()

                const isBuyerMaker = record[5].trim().toLowerCase() === 'true'

                let tsUs = rawTs < 1e12 ? rawTs * 1_000_000
                    : rawTs < 1e15 ? rawTs * 1_000
                        : rawTs

                if (tsUs <= lastTsUs) tsUs = lastTsUs + 1
                lastTsUs = tsUs

                const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
                Trade.toBuffer(buf, 0, tsUs, price, baseQty, quoteQty, isBuyerMaker)
                count++
                this.push(buf)
                callback()
            }
        })

        await pipeline(csvStream, csvParser, toBinary, writeStream, { end: false })
        return count
    }

    #fetchZipCsv (url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode === 404) {
                    res.resume()
                    resolve(null)
                    return
                }
                if (res.statusCode !== 200) {
                    res.resume()
                    reject(new Error(`GET ${url} -> ${res.statusCode}`))
                    return
                }
                resolve(res.pipe(unzipper.ParseOne()))
            }).on('error', reject)
        })
    }
}

const btc = getAsset('btc')
const eth = getAsset('eth')
const sol = getAsset('sol')
const usdc = getAsset('usdc')
const usdt = getAsset('usdt')

const symbols = [
    new Symbol(btc, usdc),
    new Symbol(eth, usdc),
    new Symbol(sol, usdc),
    new Symbol(btc, usdt),
    new Symbol(eth, usdt),
    new Symbol(sol, usdt)
]

export const binance = new Exchange('binance', symbols, new BinanceDownloader())
