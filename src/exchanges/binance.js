import https from 'https'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import unzipper from 'unzipper'
import Exchange from '../core/Exchange.js'
import Symbol from '../core/Symbol.js'
import { getAsset } from '../core/AssetList.js'
import Trade from '../core/Trade.js'

const BASE_URL = 'https://data.binance.vision/data/spot/daily/trades'

class BinanceDownloader {
    #formatSymbol (symbol) {
        return `${symbol.base.id}${symbol.quote.id}`.toUpperCase()
    }

    async downloadDay (symbol, year, month, day, writeStream) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

        if (new Date(date) >= new Date()) return 0

        const name = this.#formatSymbol(symbol)
        const url = `${BASE_URL}/${name}/${name}-trades-${date}.zip`
        const csvStream = await this.#fetchZipCsv(url)
        if (!csvStream) return 0

        return await this.#csvToBinary(csvStream, writeStream)
    }

    async #csvToBinary (csvStream, writeStream) {
        let count = 0
        let leftover = ''

        const transform = new Transform({
            transform (chunk, encoding, callback) {
                const text = leftover + chunk.toString()
                const lines = text.split('\n')
                leftover = lines.pop()

                const records = []
                for (const line of lines) {
                    if (!line.trim()) continue
                    const fields = line.split(',')
                    if (fields.length < 6) continue

                    const price = parseFloat(fields[1])
                    const baseQty = parseFloat(fields[2])
                    const quoteQty = parseFloat(fields[3])
                    const rawTs = parseInt(fields[4])
                    const isBuyerMaker = fields[5].trim().toLowerCase() === 'true'

                    const tsUs = rawTs < 1e12 ? rawTs * 1_000_000
                        : rawTs < 1e15 ? rawTs * 1_000
                            : rawTs

                    const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
                    Trade.toBuffer(buf, 0, tsUs, price, baseQty, quoteQty, isBuyerMaker)
                    records.push(buf)
                    count++
                }

                if (records.length > 0) {
                    this.push(Buffer.concat(records))
                }
                callback()
            },
            flush (callback) {
                if (leftover.trim()) {
                    const fields = leftover.split(',')
                    if (fields.length >= 6) {
                        const price = parseFloat(fields[1])
                        const baseQty = parseFloat(fields[2])
                        const quoteQty = parseFloat(fields[3])
                        const rawTs = parseInt(fields[4])
                        const isBuyerMaker = fields[5].trim().toLowerCase() === 'true'

                        const tsUs = rawTs < 1e12 ? rawTs * 1_000_000
                            : rawTs < 1e15 ? rawTs * 1_000
                                : rawTs

                        const buf = Buffer.allocUnsafe(Trade.RECORD_SIZE)
                        Trade.toBuffer(buf, 0, tsUs, price, baseQty, quoteQty, isBuyerMaker)
                        this.push(buf)
                        count++
                    }
                }
                callback()
            }
        })

        await pipeline(csvStream, transform, writeStream, { end: false })
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
