const Symbol = require('../core/Symbol')
const { createClient } = require('@clickhouse/client')
const https = require('https')
const http = require('http')
const unzipper = require('unzipper')
const Trade = require('../core/Trade')
const CandlesGenerator = require('../core/CandlesGenerator')
const EventName = require('../core/EventName')

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
        this.#historyInDays = historyInDays ?? 2
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

    async run (startTsMs) {
        const client = createClient()
        const ok = await client.ping()
        if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }
        try {
            const qr = await client.query({
                query: `select *, fromUnixTimestamp64Micro(ts, 'UTC') as tsHr from ${this.#tableName} where ts>=${startTsMs * 1000} order by ts, id`,
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
                    const js = row.json()
                    this.#events.emit(this.#eventNameTradeProcessingStart)
                    this.#events.emit(this.#eventNameTrade, new Trade(
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
                    ))
                    this.#events.emit(this.#eventNameTradeProcessingCompleted)
                })
            }
        } finally {
            this.#safeExec(async () => await client.close())
        }
    }

    async #init () {
        const client = createClient()
        const ok = await client.ping()
        if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }
        try {
            await client.query({ query: `CREATE DATABASE IF NOT EXISTS ${this.#databaseName};` })
            await client.query({ query: `CREATE TABLE IF NOT EXISTS ${this.#tableName} (${this.#columns.map(c => (`${c[0]} ${c[1]}`)).join(',')}) ENGINE = MergeTree ORDER BY (ts, id)` })
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
                await client.insert({
                    table: this.#tableName,
                    columns: this.#columns.map(c => c[0]),
                    format: 'CSV',
                    values: stream.pipe(unzipper.ParseOne())
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

    async #safeExec (fnc) {
        try {
            await fnc()
        } catch (e) {
            console.error(e)
        }
    }
}

module.exports = Binance
