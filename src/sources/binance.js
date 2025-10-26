/* eslint-disable no-unused-vars */
const Symbol = require('../core/Symbol')
const { createClient } = require('@clickhouse/client')
const https = require('https')
const http = require('http')
const unzipper = require('unzipper')
const Trade = require('../core/Trade')
const CandlesGenerator = require('../core/CandlesGenerator')
const EventName = require('../core/EventName')
/* eslint-enable no-unused-vars */

class Binance {
    #events
    #symbol
    #name = 'binance'
    #databaseName = this.#name
    #eventNameTrade
    #eventNameTradeProcessingStart
    #eventNameTradeProcessingCompleted
    #tableName
    #columns = [
        ['id', 'UInt64'],
        ['price', 'Decimal(38,18)'],
        ['baseQty', 'Decimal(38,18)'],
        ['quoteQty', 'Decimal(38,18)'],
        ['ts', 'UInt64'],
        ['isBuyerMaker', 'Bool'],
        ['isBestMatch', 'Bool']
    ]

    #historyInDays

    constructor (events, symbol, historyInDays) {
        this.#events = events
        this.#symbol = symbol
        this.#historyInDays = historyInDays
        this.#tableName = `${this.#databaseName}.trades_${this.#symbol.name('', false)}`
        this.#eventNameTrade = EventName.ofTrade(EventName.ACTION.EXECUTED, this.#name, symbol.id)
        this.#eventNameTradeProcessingStart = EventName.ofTrade(EventName.ACTION.PROCESSING_STARTED, this.#name, symbol.id)
        this.#eventNameTradeProcessingCompleted = EventName.ofTrade(EventName.ACTION.PROCESSING_COMPLETED, this.#name, symbol.id)
    }

    static async create (events, symbol, historyInDays) {
        const result = new Binance(events, symbol, historyInDays)
        await result.#init()
        return result
    }

    async getAvailableDataRangeUs () {
        const client = createClient()
        const ok = await client.ping()
        if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }
        try {
            const qr = await (await client.query({
                query: `SELECT coalesce(min(ts), 0) as minTs, coalesce(max(ts), 0) as maxTs FROM ${this.#tableName}`,
                format: 'JSONEachRow'
            })).json()
            if (qr.length === 0) { return { minTsUs: 0, maxTsUs: 0 } }
            return {
                minTsUs: qr[0].minTs,
                maxTsUs: qr[0].maxTs
            }
        } finally {
            this.#safeExec(async () => await client.close())
        }
    }

    async run (startTsMs, endTsMs = 0, tradeCallback = null) {
        const client = createClient()
        const ok = await client.ping()
        if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }
        try {
            let whereClause = `where ts>=${startTsMs * 1000}`
            if (endTsMs > 0) {
                whereClause += ` and ts<=${endTsMs * 1000}`
            }
            const qr = await client.query({
                query: `select *, fromUnixTimestamp64Micro(ts, 'UTC') as tsHr from ${this.#tableName} ${whereClause} order by ts, id`,
                compression: { response: true },
                clickhouse_settings: {
                    optimize_read_in_order: 1,
                    max_block_size: 5000, // default ~65536
                    preferred_block_size_bytes: 1048576 // ~1 MB target blocks
                },
                format: 'JSONEachRow'
            })
            if (!qr) throw new Error('Unable to execute fetching query')
            const eventEmittingCallback = (trade) => {
                this.#events.emit(this.#eventNameTradeProcessingStart)
                this.#events.emit(this.#eventNameTrade, trade)
                this.#events.emit(this.#eventNameTradeProcessingCompleted)
                return true
            }
            const callback = typeof tradeCallback === 'function' ? tradeCallback : eventEmittingCallback
            for await (const rows of qr.stream()) {
                for (const row of rows) {
                    const js = row.json()
                    if (!callback(new Trade(
                        this.#name,
                        this.#symbol,
                        null,
                        js.id,
                        null,
                        js.ts,
                        js.price,
                        js.baseQty,
                        js.quoteQty,
                        js.isBuyerMaker
                    ))) {
                        return
                    }
                }
            }
        } catch (error) {
            console.error('Error occurred while running:', error)
            throw error
        } finally {
            this.#safeExec(async () => await client.close())
        }
    }

    async #init () {
        if (this.#historyInDays === null) return Promise.resolve()
        const client = createClient()
        const ok = await client.ping()
        if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }
        try {
            await client.query({ query: `CREATE DATABASE IF NOT EXISTS ${this.#databaseName};` })
            await client.query({ query: `CREATE TABLE IF NOT EXISTS ${this.#tableName} (${this.#columns.map(c => (`${c[0]} ${c[1]}`)).join(',')}) ENGINE = MergeTree ORDER BY (ts, id)` })
            await client.query({ query: `CREATE TABLE IF NOT EXISTS ${this.#tableName}_temp (${this.#columns.map(c => (`${c[0]} ${c[1]}`)).join(',')}) ENGINE = MergeTree ORDER BY (ts, id)` })
            const latestAvailableUs = await (async () => {
                const qr = await (await client.query({
                    query: `SELECT coalesce(max(ts), 0) as maxTs FROM ${this.#tableName}`,
                    format: 'JSONEachRow'
                })).json()
                if (qr.length === 0) { return 0 }
                return qr[0].maxTs || 0
            })()
            const dayDurationMs = 24 * 3600 * 1000
            const latestAvailableDataMs = Number(BigInt(latestAvailableUs) / 1000n / BigInt(dayDurationMs)) * dayDurationMs
            const yesterdayMs = (Number(BigInt(Date.now()) / BigInt(dayDurationMs)) - 1) * dayDurationMs
            const historyStartMs = Math.max(yesterdayMs - this.#historyInDays * dayDurationMs, latestAvailableDataMs)
            for (let dayMs = historyStartMs + dayDurationMs; dayMs <= yesterdayMs; dayMs += dayDurationMs) {
                const dateTimeStr = new Date(dayMs).toISOString().split('T')[0]
                const exchangeSymbolName = this.#symbol.name('', true)
                const zipUrl = `https://data.binance.vision/data/spot/daily/trades/${exchangeSymbolName}/${exchangeSymbolName}-trades-${dateTimeStr}.zip`
                const stream = await this.#httpGetStream(zipUrl)
                if (!stream) {
                    console.log(`Skip missing ${zipUrl}`)
                    continue
                }
                await client.query({ query: `TRUNCATE TABLE ${this.#tableName}_temp` })
                await client.insert({
                    table: `${this.#tableName}_temp`,
                    columns: this.#columns.map(c => c[0]),
                    format: 'CSV',
                    values: stream.pipe(unzipper.ParseOne())
                })
                await client.query({
                    query: `
INSERT INTO ${this.#tableName}
SELECT
    ${this.#columns
        .map(([name]) => name === 'ts'
            ? `multiIf(
            length(toString(ts)) <= 10,  ts * 1000000,
            length(toString(ts)) <= 13,  ts * 1000,
                                         ts
          ) AS ts`
            : name
        )
        .join(',')}
FROM ${this.#tableName}_temp`
                })
                console.log(`Inserted ${zipUrl}`)
            }
        } finally {
            this.#safeExec(async () => await client.close())
        }
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

    async exportAllData (pathToBinaryFile) {
        const fs = require('fs')
        const client = createClient()
        const ok = await client.ping()
        if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }

        const RECORD_SIZE = 40 // 8+8+8+8+8 bytes per record

        try {
            // Get total count for progress tracking
            const countResult = await (await client.query({
                query: `SELECT COUNT(*) as total FROM ${this.#tableName}`,
                format: 'JSONEachRow'
            })).json()
            const totalRecords = countResult[0].total
            console.log(`Exporting ${totalRecords} records to binary file: ${pathToBinaryFile}`)

            // Create write stream
            const writeStream = fs.createWriteStream(pathToBinaryFile)

            // Process data in chunks using LIMIT/OFFSET to avoid memory overflow
            let processedRecords = 0
            let offset = 0
            const chunkSize = 1000000 // Process 1M records at a time

            while (offset < totalRecords) {
                console.log(`Processing chunk: ${offset} to ${Math.min(offset + chunkSize, totalRecords)}`)
                const qr = await client.query({
                    query: `SELECT id, ts, price, baseQty, quoteQty, isBuyerMaker, isBestMatch 
                           FROM ${this.#tableName} 
                           ORDER BY ts, id 
                           LIMIT ${chunkSize} OFFSET ${offset}`,
                    format: 'JSONEachRow'
                })

                const chunkRecords = await qr.json()

                if (chunkRecords.length === 0) break

                // Process this chunk
                const chunkBuffer = Buffer.allocUnsafe(chunkRecords.length * RECORD_SIZE)
                let bufferOffset = 0

                for (const trade of chunkRecords) {
                    // Pack flags into top 2 bits of ID
                    const flags = (trade.isBuyerMaker ? 1 : 0) | (trade.isBestMatch ? 2 : 0)
                    const idWithFlags = BigInt(trade.id) | (BigInt(flags) << 62n)

                    // Write binary record: id_and_flags, timestamp, price, baseQty, quoteQty
                    chunkBuffer.writeBigUInt64LE(idWithFlags, bufferOffset)
                    chunkBuffer.writeBigUInt64LE(BigInt(trade.ts), bufferOffset + 8)
                    chunkBuffer.writeDoubleLE(parseFloat(trade.price), bufferOffset + 16)
                    chunkBuffer.writeDoubleLE(parseFloat(trade.baseQty), bufferOffset + 24)
                    chunkBuffer.writeDoubleLE(parseFloat(trade.quoteQty), bufferOffset + 32)

                    bufferOffset += RECORD_SIZE
                    processedRecords++
                }

                // Write chunk to file with backpressure handling
                await new Promise((resolve, reject) => {
                    writeStream.write(chunkBuffer, (err) => {
                        if (err) reject(err)
                        else resolve()
                    })
                })

                offset += chunkRecords.length

                // Progress update
                const progress = ((processedRecords / totalRecords) * 100).toFixed(1)
                console.log(`Export progress: ${processedRecords}/${totalRecords} (${progress}%)`)

                // Force garbage collection between chunks
                if (global.gc) global.gc()
            }

            // Close write stream
            await new Promise((resolve, reject) => {
                writeStream.end((err) => {
                    if (err) reject(err)
                    else resolve()
                })
            })

            console.log(`Export completed: ${processedRecords} records written to ${pathToBinaryFile}`)
            const fileSizeGB = (processedRecords * RECORD_SIZE / (1024 * 1024 * 1024)).toFixed(2)
            console.log(`File size: ${fileSizeGB} GB`)
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

module.exports = Binance
