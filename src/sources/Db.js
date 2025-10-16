const { createClient } = require('@clickhouse/client')
const { safeExec } = require('../utils/utils')

class Db {
    constructor (config) {
        this.config = config
        this.client = null
    }

    static async create (config) {
        const result = new Db(config)
        try {
            await result.#init()
            return result
        } catch (e) {
            safeExec(async () => await result.close())
            throw e
        }
    }

    async close () {
        if (!this.client) return
        const local = this.client
        this.client = null
        await local.close()
    }

    async query (q) { return (await this.client.query(q)) }
    async insert (q) { return (await this.client.insert(q)) }

    async #init () {
        const client = createClient(this.config)
        if (!client) { throw new Error('unable to initialize the client') }
        try {
            const ok = await client.ping()
            if ((!ok) || (!ok.success)) { throw new Error('unable to ping the client') }
            this.client = client
        } catch (e) {
            safeExec(async () => await client.close())
            throw e
        }
    }
}

module.exports = Db
