const Db = require('../../sources/Db')
const https = require('https')
const http = require('http')
const unzipper = require('unzipper')

const getColumns = () => {
    return [['id', 'UInt64'], ['price', 'Decimal(38,18)'], ['baseQty', 'Decimal(38,18)'], ['quoteQty', 'Decimal(38,18)'], ['ts', 'UInt64'], ['isBuyerMaker', 'Bool'], ['isBestMatch', 'Bool']]
}

const createTable = async (db, exchangeName, symbolName) => {
    await db.query({ query: `CREATE DATABASE IF NOT EXISTS ${Db.databaseName(exchangeName)}` })
    await db.query({ query: `CREATE TABLE IF NOT EXISTS ${Db.tableName(exchangeName, symbolName)} (${getColumns().map(c => (`${c[0]} ${c[1]}`)).join(',')}) ENGINE = MergeTree ORDER BY (ts, id)` })
}

const getLatestAvailableDataTimestampUs = async (db, exchangeName, symbolName) => {
    const qr = await (await db.query({
        query: `SELECT coalesce(max(ts), 0) as maxTs FROM ${Db.tableName(exchangeName, symbolName)}`,
        format: 'JSONEachRow'
    })).json()
    if (qr.length === 0) { return 0 }
    return qr[0].maxTs || 0
}

const httpGetStream = (url) => {
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

const ensureData = async (dbConfig, symbolName, historySizeInDays) => {
    const exchangeName = 'binance'
    const db = await Db.create(dbConfig)
    if (!db) { throw new Error('unable to initialize the client') }
    try {
        await createTable(db, exchangeName, symbolName)
        const dayDurationMs = 24 * 3600 * 1000
        const latestAvailableUs = await getLatestAvailableDataTimestampUs(db, exchangeName, symbolName)
        const latestAvailableDataMs = Number(BigInt(latestAvailableUs) / 1000n / BigInt(dayDurationMs)) * dayDurationMs
        const yesterdayMs = (Number(BigInt(Date.now()) / BigInt(dayDurationMs)) - 1) * dayDurationMs
        const historyStartMs = Math.max(yesterdayMs - historySizeInDays * dayDurationMs, latestAvailableDataMs)
        for (let dayMs = historyStartMs + dayDurationMs; dayMs <= yesterdayMs; dayMs += dayDurationMs) {
            const dateTimeStr = new Date(dayMs).toISOString().split('T')[0]
            const zipUrl = `https://data.binance.vision/data/spot/daily/trades/${symbolName}/${symbolName}-trades-${dateTimeStr}.zip`
            await db.insert({
                table: Db.tableName(exchangeName, symbolName),
                columns: getColumns().map(c => c[0]),
                format: 'CSV',
                values: (await httpGetStream(zipUrl)).pipe(unzipper.ParseOne())
            })
            console.log(`Inserted ${zipUrl}`)
        }
    } catch (e) {
        console.log(e)
        throw e
    } finally {
        db.close()
    }
}

module.exports = {
    ensureData
}
