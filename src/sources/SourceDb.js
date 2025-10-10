const { safeExec } = require('../utils/utils')
const Db = require('./Db')

class SourceDb {
    constructor (events, dbConfig) {
        this.events = events
        this.dbConfig = dbConfig
        this.db = null
    }

    static async create (events, config) {
        const result = new SourceDb(events, config)
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
    }

    async start (symbol, start, end) {
        const qr = await this.db.query({
            query: `SELECT    fromUnixTimestamp64Micro(ts, 'UTC') AS ts_human, *
            FROM market.trades
            ORDER BY (symbol, ts, id)
            `,
            clickhouse_settings: { optimize_read_in_order: 1 },
            format: 'JSONEachRow'
        })
        if (!qr) throw new Error('Unable to execute fetching query')
        const toBigInt = (s) => {
            const ints = s.split('.')
            return BigInt(ints[0]) * 100000000n + BigInt(ints[1])
        }
        for await (const rows of qr.stream()) {
            rows.forEach((row) => {
                const j = row.json()
                j.qty = toBigInt(j.qty)
                j.price = toBigInt(j.price)
                j.quote_qty = toBigInt(j.quote_qty)
                this.events.emit('tick', j)
            }
            )
        }
    }
}
module.exports = SourceDb
