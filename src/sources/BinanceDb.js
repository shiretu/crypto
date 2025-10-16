const { safeExec } = require('../utils/utils')
const Db = require('./Db')
const https = require('https')
const http = require('http')
const unzipper = require('unzipper')

class SourceDb {
    constructor (events, dbConfig, symbolName, historyInDays) {
        this.exchangeName = 'binance'
        this.symbolName = symbolName
        this.historyInDays = historyInDays
        this.columns = [
            ['id', 'UInt64'],
            ['price', 'Decimal(38,18)'],
            ['baseQty', 'Decimal(38,18)'],
            ['quoteQty', 'Decimal(38,18)'],
            ['ts', 'UInt64'],
            ['isBuyerMaker', 'Bool'],
            ['isBestMatch', 'Bool']
        ]
        this.events = events
        this.dbConfig = dbConfig
        this.db = null
    }

    static async create (events, config, symbolName, historyInDays) {
        const result = new SourceDb(events, config, symbolName, historyInDays)
        try {
            await result.#init()
            return result
        } catch (e) {
            safeExec(async () => await result.close())
            throw e
        }
    }

    async #init () {
        const db = await Db.create(this.dbConfig)
        if (!db) { throw new Error('unable to initialize the client') }
        this.db = db
        await this.#fetchData()
    }

    async start () {
        const qr = await this.db.query({
            query: `SELECT
                *, 
                '${this.symbolName}' as symbolName,
                fromUnixTimestamp64Micro(ts, 'UTC') AS tsHr,
                intDiv(ts, 60000000)   as tsAsMinute,
                intDiv(ts, 600000000)  AS tsAs10Minutes,
                intDiv(ts, 3600000000) AS tsAsHour
            FROM ${this.tableName()}
            ORDER BY ts, id
            `,
            compression: { response: true },
            clickhouse_settings: {
                optimize_read_in_order: 1,
                max_block_size: 5000, // default ~65536
                preferred_block_size_bytes: 1048576 // ~1 MB target blocks
            },
            format: 'JSONEachRow'
        })
        if (!qr) throw new Error('Unable to execute fetching query')
        for await (const rows of qr.stream()) {
            rows.forEach((row) => {
                this.events.emit('tick', row.json())
            })
        }
    }

    async close () {
        if (this.db) {
            await this.db.close()
            this.db = null
        }
    }

    databaseName () { return this.exchangeName }

    tableName () { return `${this.databaseName()}.trades_${this.symbolName}` }

    async #createTable () {
        await this.db.query({ query: `CREATE DATABASE IF NOT EXISTS ${this.databaseName()};` })
        await this.db.query({ query: `CREATE TABLE IF NOT EXISTS ${this.tableName()} (${this.columns.map(c => (`${c[0]} ${c[1]}`)).join(',')}) ENGINE = MergeTree ORDER BY (ts, id)` })
    }

    async #getLatestAvailableDataTimestampUs () {
        const qr = await (await this.db.query({
            query: `SELECT coalesce(max(ts), 0) as maxTs FROM ${this.tableName()}`,
            format: 'JSONEachRow'
        })).json()
        if (qr.length === 0) { return 0 }
        return qr[0].maxTs || 0
    }

    httpGetStream (url) {
        return new Promise((resolve, reject) => {
            const u = new URL(url)
            const client = u.protocol === 'https:' ? https : http
            const req = client.get(u, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`GET ${url} -> ${res.statusCode}`))
                    return
                }
                resolve(res)
            })
            req.on('error', reject)
        })
    }

    async #fetchData () {
        try {
            await this.#createTable()
            const dayDurationMs = 24 * 3600 * 1000
            const latestAvailableUs = await this.#getLatestAvailableDataTimestampUs()
            const latestAvailableDataMs = Number(BigInt(latestAvailableUs) / 1000n / BigInt(dayDurationMs)) * dayDurationMs
            const yesterdayMs = (Number(BigInt(Date.now()) / BigInt(dayDurationMs)) - 1) * dayDurationMs
            const historyStartMs = Math.max(yesterdayMs - this.historyInDays * dayDurationMs, latestAvailableDataMs)
            for (let dayMs = historyStartMs + dayDurationMs; dayMs <= yesterdayMs; dayMs += dayDurationMs) {
                const dateTimeStr = new Date(dayMs).toISOString().split('T')[0]
                const zipUrl = `https://data.binance.vision/data/spot/daily/trades/${this.symbolName}/${this.symbolName}-trades-${dateTimeStr}.zip`
                await this.db.insert({
                    table: this.tableName(),
                    columns: this.columns.map(c => c[0]),
                    format: 'CSV',
                    values: (await this.httpGetStream(zipUrl)).pipe(unzipper.ParseOne())
                })
                console.log(`Inserted ${zipUrl}`)
            }
        } catch (e) {
            console.log(e)
            throw e
        }
    }
}
module.exports = SourceDb
