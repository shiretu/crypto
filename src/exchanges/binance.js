import https from 'https'
import { pipeline } from 'stream/promises'
import { Transform, PassThrough } from 'stream'
import { parse } from 'csv-parse'
import unzipper from 'unzipper'
import Exchange from '../core/Exchange.js'
import Symbol from '../core/Symbol.js'
import Trade from '../core/Trade.js'
import Day from '../utils/Day.js'
import { getAsset } from '../core/assets.js'

class BinanceDownloader {
    #baseUrl = 'https://data.binance.vision/data/spot/daily/trades'

    #formatSymbol (symbol) {
        return `${symbol.base.id}${symbol.quote.id}`.toUpperCase()
    }

    async downloadDay (symbol, dayTsUs) {
        const dateStr = Day.toStr(dayTsUs)
        if (dayTsUs >= Day.today()) return Buffer.alloc(0)

        const name = this.#formatSymbol(symbol)
        const url = `${this.#baseUrl}/${name}/${name}-trades-${dateStr}.zip`
        const csvStream = await this.#fetchZipCsv(url)
        if (!csvStream) return Buffer.alloc(0)

        return await this.#csvToBuffer(csvStream)
    }

    async #csvToBuffer (csvStream) {
        const chunks = []
        let lastTsUs = -1
        let recordIndex = 0

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

                let tsUs = rawTs < 1e12
                    ? rawTs * 1_000_000
                    : rawTs < 1e15
                        ? rawTs * 1_000
                        : rawTs

                if (tsUs <= lastTsUs) tsUs = lastTsUs + 1
                lastTsUs = tsUs

                const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
                Trade.writeRecord(buf, 0, tsUs, recordIndex++, price, baseQty, quoteQty, isBuyerMaker)
                chunks.push(buf)
                callback()
            }
        })

        const sink = new PassThrough()
        sink.resume()

        await pipeline(csvStream, csvParser, toBinary, sink)
        return Buffer.concat(chunks)
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

const pairs = [
    ['btc', 'usdc'], ['btc', 'usdt'],
    ['eth', 'usdc'], ['eth', 'usdt'],
    ['sol', 'usdc'], ['sol', 'usdt']
]

export const binance = new Exchange('binance',
    pairs.map(([b, q]) => new Symbol(getAsset(b), getAsset(q))),
    new BinanceDownloader()
)
