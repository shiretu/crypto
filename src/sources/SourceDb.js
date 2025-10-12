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
            query: `SELECT
                *, 
                fromUnixTimestamp64Micro(ts, 'UTC') AS tsHr,
                intDiv(ts, 60000000)   as tsAsMinute,
                intDiv(ts, 600000000)  AS tsAs10Minutes,
                intDiv(ts, 3600000000) AS tsAsHour
            FROM market.trades
            WHERE symbol == '${symbol}'
            ORDER BY symbol, ts, id
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
}
module.exports = SourceDb
