import Store from './Store.js'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { Worker } from 'worker_threads'
import { OutcomeRef } from '../core/Outcome.js'
import Trades from './Trades.js'
import Candles from './Candles.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

export default class Outcomes extends Store {
    static #candleDurationSec = 30

    #tpPercent
    #slPercent

    constructor (dataDir, symbol, tpPercent, slPercent) {
        super(dataDir, symbol, 'outcomes', OutcomeRef.RECORD_SIZE, [`${tpPercent}`, `${slPercent}`])
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
    }

    async computeDayBuffer (dayTsUs) {
        const tradesStore = new Trades(this.dataDir, this.symbol)
        await tradesStore.loadAsync(dayTsUs, dayTsUs)
        const totalTrades = tradesStore.buffers.get(dayTsUs)?.count ?? 0
        if (totalTrades === 0) return Buffer.alloc(0)

        const candlesStore = new Candles(this.dataDir, this.symbol, Outcomes.#candleDurationSec, tradesStore)
        await candlesStore.loadAsync(dayTsUs, dayTsUs)

        const tradesObj = tradesStore.toAnonymousObject()
        const candlesObj = candlesStore.toAnonymousObject()

        const progress = { type: 'progress', dayTsUs, total: totalTrades, chunkStart: 0, chunkSize: 0, processed: 0 }

        const cpusCount = os.cpus().length
        const workersCount = cpusCount * 2
        const chunkSize = Math.ceil(totalTrades / workersCount)

        const spawnWorker = (startIndex, size) => new Promise((resolve, reject) => {
            const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'OutcomesWorker.js')
            const worker = new Worker(workerPath, {
                workerData: {
                    tradesObj,
                    candlesObj,
                    dataDir: this.dataDir,
                    tpPercent: this.#tpPercent,
                    slPercent: this.#slPercent,
                    dayTsUs,
                    startIndex,
                    endIndex: startIndex + size
                }
            })
            worker.on('message', (msg) => {
                if (msg.type === 'progress') {
                    if ((msg.index % 1000 === 0) || (msg.index === startIndex + size - 1)) {
                        progress.chunkStart = startIndex
                        progress.chunkSize = size
                        progress.processed = msg.index - startIndex
                        this.emit(progress)
                    }
                } else if (msg.type === 'done') {
                    resolve(Buffer.from(msg.buffer))
                }
            })
            worker.on('error', reject)
        })

        const promises = []
        for (let startIndex = 0; startIndex < totalTrades; startIndex += chunkSize) {
            const size = Math.min(chunkSize, totalTrades - startIndex)
            promises.push(spawnWorker(startIndex, size))
        }

        const buffers = await Promise.all(promises)
        return Buffer.concat(buffers)
    }

    makeRecord (buf, offset, dayIndex, absoluteIndex) {
        return new OutcomeRef(buf.subarray(offset, offset + this.recordSize))
    }

    toAnonymousObject () {
        return { ...super.toAnonymousObject(), tpPercent: this.#tpPercent, slPercent: this.#slPercent }
    }

    static fromAnonymousObject (obj) {
        const store = new Outcomes(obj.dataDir, resolveSymbol(obj.symbolId), obj.tpPercent, obj.slPercent)
        store._restoreFrom(obj)
        return store
    }
}
