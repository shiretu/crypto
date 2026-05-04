import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import Trade from '../core/Trade.js'
import TradeOutcome from '../core/TradeOutcome.js'
import Trades from './Trades.js'
import FilePart from '../utils/FilePart.js'
import { dateStr, nextDay, compareDates } from '../utils/date.js'
import { getFilePath } from '../utils/storage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WORKER_PATH = path.join(__dirname, 'tradeOutcomesWorker.js')

const RECORD_SIZE = 48

export default class TradeOutcomes {
    #dataDir
    #symbol
    #tpPercent
    #slPercent
    #openTradeStore
    #closeTradeStore
    #filePart
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
        this.#filePart = null
        this.#onProgress = onProgress || null
    }

    #getFilePath (year, month, day) {
        return getFilePath(this.#dataDir, 'outcomes', this.#symbol, year, month, day,
            `tp${this.#tpPercent}_sl${this.#slPercent}`)
    }

    async #ensureDayAsync (year, month, day) {
        const file = this.#getFilePath(year, month, day)
        try {
            await fs.promises.access(file)
            return
        } catch {}

        const tradeStore = new Trades(this.#dataDir, this.#symbol)
        const currentDay = { year, month, day }
        const trades = await tradeStore.readArrayAsync(currentDay.year, currentDay.month, currentDay.day,
            currentDay.year, currentDay.month, currentDay.day)
        const cpusCount = os.cpus().length * 2
        const chunkSize = Math.ceil(trades.length / cpusCount)

        const spawnWorker = (startIndex, size) => new Promise((resolve, reject) => {
            const worker = new Worker(WORKER_PATH, {
                workerData: {
                    dataDir: this.#dataDir,
                    exchangeId: this.#symbol.exchange.id,
                    pairId: this.#symbol.pairId,
                    year,
                    month,
                    day,
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

        const tmpFile = file + '.tmp'
        await fs.promises.mkdir(path.dirname(file), { recursive: true })
        await fs.promises.writeFile(tmpFile, buf)
        await fs.promises.rename(tmpFile, file)
    }

    async * readAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDayAsync(cur.year, cur.month, cur.day)
            const filePath = this.#getFilePath(cur.year, cur.month, cur.day)
            this.#filePart = await FilePart.createAsync({ filePart: this.#filePart, filePath })
            const buf = await this.#filePart.readAsync({})
            if (buf.length >= RECORD_SIZE) {
                const count = Math.floor(buf.length / RECORD_SIZE)
                for (let i = 0; i < count; i++) {
                    const off = i * RECORD_SIZE
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
                    yield outcome
                }
            }
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    async readArrayAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        const result = []
        for await (const outcome of this.readAsync(startYear, startMonth, startDay, endYear, endMonth, endDay)) {
            result.push(outcome)
        }
        return result
    }
}
