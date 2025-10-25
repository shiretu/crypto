const Symbol = require('../core/Symbol')
const { createClient } = require('@clickhouse/client')
const https = require('https')
const http = require('http')
const fs = require('fs')
const unzipper = require('unzipper')
const Trade = require('../core/Trade')
const CandlesGenerator = require('../core/CandlesGenerator')
const EventName = require('../core/EventName')
const lzma = require('lzma-native')
const { Transform, PassThrough } = require('stream')

class AdmiralMarkets {
    #name = 'admiralmarkets'
    #events
    #symbol
    #historyInHours
    #eventNameTrade
    #eventNameTradeProcessingStart
    #eventNameTradeProcessingCompleted
    #databaseName = this.#name
    #tableName
    #columns = [
        ['tsMs', 'UInt64'],
        ['askPrice', 'UInt64'],
        ['bidPrice', 'UInt64'],
        ['askVolume', 'UInt64'],
        ['bidVolume', 'UInt64']
    ]

    constructor (events, symbol, historyInDays) {
        this.#events = events
        this.#symbol = symbol
        this.#historyInHours = (historyInDays ?? 2) * 24
        this.#eventNameTrade = EventName.ofTrade(EventName.ACTION.EXECUTED, this.#name, symbol.id)
        this.#eventNameTradeProcessingStart = EventName.ofTrade(EventName.ACTION.PROCESSING_STARTED, this.#name, symbol.id)
        this.#eventNameTradeProcessingCompleted = EventName.ofTrade(EventName.ACTION.PROCESSING_COMPLETED, this.#name, symbol.id)
        this.#tableName = `${this.#databaseName}.trades_${this.#symbol.name('', false)}`
    }

    static async create (events, symbol, historyInDays) {
        const result = new AdmiralMarkets(events, symbol, historyInDays)
        await result.#init()
        return result
    }

    #httpGetStream (url) {
        return new Promise((resolve, reject) => {
            const u = new URL(url)
            const client = u.protocol === 'https:' ? https : http
            const req = client.get(u, (res) => {
                if (res.statusCode === 404) {
                    resolve(null)
                    return
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`GET ${url} -> ${res.statusCode}`))
                    return
                }
                resolve(res)
            })
            req.on('error', reject)
        })
    }

    async #init () {
        const client = createClient()
        const ok = await client.ping()
        if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }
        try {
            await client.query({ query: `CREATE DATABASE IF NOT EXISTS ${this.#databaseName};` })
            await client.query({ query: `CREATE TABLE IF NOT EXISTS ${this.#tableName} (${this.#columns.map(c => (`${c[0]} ${c[1]}`)).join(',')}) ENGINE = MergeTree ORDER BY tsMs` })
            const hourDurationMs = 3600 * 1000
            const latestAvailableMs = await (async () => {
                const qr = await (await client.query({
                    query: `SELECT coalesce(max(tsMs), 0) as maxTs FROM ${this.#tableName}`,
                    format: 'JSONEachRow'
                })).json()
                if (qr.length === 0) { return 0 }
                return qr[0].maxTs || 0
            })()
            const latestAvailableDataMs = Number(BigInt(latestAvailableMs) / BigInt(hourDurationMs)) * hourDurationMs
            const lastHourMs = (Number(BigInt(Date.now()) / BigInt(hourDurationMs)) - 1) * hourDurationMs
            const historyStartMs = Math.max(lastHourMs - this.#historyInHours * hourDurationMs, latestAvailableDataMs)
            for (let currentHourMs = historyStartMs + hourDurationMs; currentHourMs <= lastHourMs; currentHourMs += hourDurationMs) {
                const dateTimeStr = new Date(currentHourMs).toISOString().replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}).*$/, '$1/$2/$3/$4')
                const zipUrl = `https://datafeed.dukascopy.com/datafeed/${this.#symbol.name('', true)}/${dateTimeStr}h_ticks.bi5`
                const stream = await this.#httpGetStream(zipUrl)
                if (!stream) {
                    console.log(`Skip missing ${zipUrl}`)
                    continue
                }
                let buf = Buffer.alloc(0)
                const recSize = 20
                const toCsv = new Transform({
                    transform (chunk, _enc, cb) {
                        buf = Buffer.concat([buf, chunk])
                        while (buf.length >= recSize) {
                            const r = buf.subarray(0, recSize)
                            const ms = r.readUInt32BE(0)
                            const ask = r.readUInt32BE(4)
                            const bid = r.readUInt32BE(8)
                            const aVol = r.readUInt32BE(12)
                            const bVol = r.readUInt32BE(16)
                            const tsMs = currentHourMs + ms
                            this.push(`${tsMs},${ask},${bid},${aVol},${bVol}\n`)
                            buf = buf.slice(recSize)
                        }
                        cb()
                    }
                })
                const tolerantLzmaDecompressor = () => {
                    const dec = lzma.createDecompressor()
                    const out = new PassThrough()

                    // Pipe decompressed bytes into 'out'
                    dec.pipe(out)

                    // Swallow "no progress" as an empty stream; propagate other errors
                    dec.on('error', (err) => {
                        if (err && (err.code === 10 || err.desc === 'No progress is possible')) {
                            console.error(`Error inserting data from ${zipUrl}:`, err.message)
                            out.end()
                        } else {
                            out.destroy(err)
                        }
                    })

                    return { writeTo: dec, readFrom: out }
                }
                const { writeTo, readFrom } = tolerantLzmaDecompressor()
                stream.pipe(writeTo)
                await client.insert({
                    table: this.#tableName,
                    columns: this.#columns.map(c => c[0]),
                    format: 'CSV',
                    values: readFrom.pipe(toCsv)
                })
                console.log(`Inserted ${zipUrl}`)
            }
        } finally {
            this.#safeExec(async () => await client.close())
        }
    }

    async #safeExec (fnc) {
        try {
            await fnc()
        } catch (e) {
            console.error(e)
        }
    }
}

module.exports = AdmiralMarkets
