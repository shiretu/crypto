import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import Trade from '../core/Trade.js'
import TradeOutcome from '../core/TradeOutcome.js'
import Trades from './Trades.js'
import CachedFile from '../utils/CachedFile.js'
import Day from '../utils/Day.js'
import { getFilePath, saveFile } from '../utils/storage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WORKER_PATH = path.join(__dirname, 'tradeOutcomesWorker.js')

const workerCount = os.cpus().length * 4
if (!process.env.UV_THREADPOOL_SIZE || parseInt(process.env.UV_THREADPOOL_SIZE) < workerCount) {
    process.env.UV_THREADPOOL_SIZE = String(workerCount)
}

const RECORD_SIZE = 48

export default class TradeOutcomes {
    #dataDir
    #symbol
    #tpPercent
    #slPercent
    #openTradeStore
    #closeTradeStore
    #cachedFile
    #onProgress

    constructor (dataDir, symbol, { tpPercent, slPercent, onProgress }) {
        if (!symbol.exchange) throw new Error('Symbol must belong to an exchange')
        if (tpPercent <= 0) throw new Error('tpPercent must be positive')
        if (slPercent <= 0) throw new Error('slPercent must be positive')
        this.#dataDir = dataDir
        this.#symbol = symbol
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
        this.#openTradeStore = new Trades(dataDir, symbol)
        this.#closeTradeStore = new Trades(dataDir, symbol)
        this.#cachedFile = null
        this.#onProgress = onProgress || null
    }

    #getFilePath (date) {
        return getFilePath(this.#dataDir, 'outcomes', this.#symbol, date,
            `tp${this.#tpPercent}_sl${this.#slPercent}`)
    }

    async #ensureDayAsync (date) {
        const file = this.#getFilePath(date)
        try {
            await fs.promises.access(file)
            return
        } catch {}

        const tradeStore = new Trades(this.#dataDir, this.#symbol)
        const trades = await tradeStore.readArrayAsync(date, date)
        const cpusCount = os.cpus().length * 4
        const chunkSize = Math.ceil(trades.length / cpusCount)

        const spawnWorker = (startIndex, size) => new Promise((resolve, reject) => {
            const worker = new Worker(WORKER_PATH, {
                workerData: {
                    dataDir: this.#dataDir,
                    symbolId: this.#symbol.id,
                    year: date.year,
                    month: date.month,
                    day: date.day,
                    startIndex,
                    chunkSize: size,
                    tpPercent: this.#tpPercent,
                    slPercent: this.#slPercent
                }
            })
            worker.on('message', (msg) => {
                if (msg.type === 'progress' && this.#onProgress) {
                    this.#onProgress(msg.data)
                } else if (msg.type === 'done') {
                    resolve(msg.completed)
                }
            })
            worker.on('error', reject)
        })

        const workers = []
        for (let i = 0; i < trades.length; i += chunkSize) {
            const size = Math.min(chunkSize, trades.length - i)
            workers.push(spawnWorker(i, size))
        }
        const results = await Promise.all(workers)
        const completed = results.flat()

        completed.sort((a, b) => a.openTsUs - b.openTsUs)
        const buf = Buffer.allocUnsafe(completed.length * RECORD_SIZE)
        for (let i = 0; i < completed.length; i++) {
            const off = i * RECORD_SIZE
            const o = completed[i]
            buf.writeBigUInt64LE(BigInt(o.openTsUs), off)
            buf.writeBigUInt64LE(BigInt(o.openSrcId), off + 8)
            buf.writeBigUInt64LE(BigInt(o.longCloseTsUs), off + 16)
            buf.writeBigUInt64LE(BigInt(o.longCloseSrcId), off + 24)
            buf.writeBigUInt64LE(BigInt(o.shortCloseTsUs), off + 32)
            buf.writeBigUInt64LE(BigInt(o.shortCloseSrcId), off + 40)
        }

        await saveFile(file, buf)
    }

    async fetchAsync (start, end) {
        let cur = start
        while (Day.compare(cur, end) <= 0) {
            await this.#ensureDayAsync(cur)
            cur = Day.nextDay(cur)
        }
    }

    async #hydrateRecord (buf, off) {
        const openTsUs = Number(buf.readBigUInt64LE(off))
        const openSrcId = Number(buf.readBigUInt64LE(off + 8))
        const longCloseTsUs = Number(buf.readBigUInt64LE(off + 16))
        const longCloseSrcId = Number(buf.readBigUInt64LE(off + 24))
        const shortCloseTsUs = Number(buf.readBigUInt64LE(off + 32))
        const shortCloseSrcId = Number(buf.readBigUInt64LE(off + 40))

        const openTrade = await this.#openTradeStore.readAtAsync(openTsUs, openSrcId)
        const longCloseTrade = await this.#closeTradeStore.readAtAsync(longCloseTsUs, longCloseSrcId)
        const shortCloseTrade = await this.#closeTradeStore.readAtAsync(shortCloseTsUs, shortCloseSrcId)

        const outcome = new TradeOutcome({
            tpPercent: this.#tpPercent,
            slPercent: this.#slPercent,
            trade: openTrade
        })
        outcome.update(longCloseTrade)
        outcome.update(shortCloseTrade)
        return outcome
    }

    async * readAsync (start, end) {
        let cur = start
        while (Day.compare(cur, end) <= 0) {
            await this.#ensureDayAsync(cur)
            const filePath = this.#getFilePath(cur)
            this.#cachedFile = await CachedFile.createAsync({ existingFile: this.#cachedFile, filePath })
            const buf = await this.#cachedFile.readAsync({})
            if (buf.length >= RECORD_SIZE) {
                const count = Math.floor(buf.length / RECORD_SIZE)
                for (let i = 0; i < count; i++) {
                    yield await this.#hydrateRecord(buf, i * RECORD_SIZE)
                }
            }
            cur = Day.nextDay(cur)
        }
    }

    async readArrayAsync (start, end) {
        const result = []
        for await (const outcome of this.readAsync(start, end)) {
            result.push(outcome)
        }
        return result
    }

    async readAtAsync (tsUs) {
        const date = Day.fromTsUs(tsUs)
        await this.#ensureDayAsync(date)
        const filePath = this.#getFilePath(date)
        const cachedFile = await CachedFile.createAsync({ filePath })
        const buf = await cachedFile.readAsync({})
        const count = Math.floor(buf.length / RECORD_SIZE)

        let lo = 0
        let hi = count - 1
        let found = -1
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1
            const midTsUs = Number(buf.readBigUInt64LE(mid * RECORD_SIZE))
            if (midTsUs === tsUs) { found = mid; break }
            if (midTsUs < tsUs) lo = mid + 1
            else hi = mid - 1
        }

        if (found === -1) throw new Error(`No outcome found for tsUs=${tsUs}`)

        return this.#hydrateRecord(buf, found * RECORD_SIZE)
    }
}
