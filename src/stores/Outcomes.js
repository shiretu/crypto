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
    #workers = null

    constructor (dataDir, symbol, tpPercent, slPercent) {
        super(dataDir, symbol, 'outcomes', OutcomeRef.RECORD_SIZE, [`${tpPercent}`, `${slPercent}`])
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
    }

    #ensurePool () {
        if (this.#workers) return
        const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'OutcomesWorker.js')
        const count = os.cpus().length * 2
        this.#workers = Array.from({ length: count }, () => new Worker(workerPath))
    }

    #runOnWorker (worker, request) {
        return new Promise((resolve, reject) => {
            const progressMsg = {
                type: 'progress',
                dayTsUs: 0,
                total: 0,
                chunkStart: 0,
                chunkSize: 0,
                processed: 0
            }
            const onMessage = (msg) => {
                switch (msg.type) {
                    case 'progress':
                        if ((msg.index % 1000 === 0) || (msg.index === request.endIndex - 1)) {
                            progressMsg.dayTsUs = request.dayTsUs
                            progressMsg.total = request.total
                            progressMsg.chunkStart = request.startIndex
                            progressMsg.chunkSize = request.endIndex - request.startIndex
                            progressMsg.processed = msg.index - request.startIndex
                            this.emit(progressMsg)
                        }
                        break
                    case 'done':
                        finish(Buffer.from(msg.buffer))
                        break
                    case 'error':
                        finish(null, new Error(msg.message))
                        break
                    default:
                        console.error(`Unknown message type from worker: ${msg.type}`)
                        break
                }
            }
            const onError = (err) => finish(null, err)
            const finish = (res, err) => {
                worker.removeListener('message', onMessage)
                worker.removeListener('error', onError)
                if (err) { reject(err) } else { resolve(res) }
            }
            worker.on('message', onMessage)
            worker.on('error', onError)
            worker.postMessage(request)
        })
    }

    async computeDayBuffer (dayTsUs) {
        const tradesStore = new Trades(this.dataDir, this.symbol)
        await tradesStore.loadAsync(dayTsUs, dayTsUs)
        const totalTrades = await tradesStore.getRecordCount(dayTsUs)
        if (totalTrades === 0) return Buffer.alloc(0)

        const candlesStore = new Candles(this.dataDir, this.symbol, Outcomes.#candleDurationSec, tradesStore)
        await candlesStore.loadAsync(dayTsUs, dayTsUs)

        this.#ensurePool()
        const tradesObj = tradesStore.toAnonymousObject()
        const candlesObj = candlesStore.toAnonymousObject()
        const chunkSize = Math.ceil(totalTrades / this.#workers.length)

        const promises = []
        let workerIdx = 0
        for (let startIndex = 0; startIndex < totalTrades; startIndex += chunkSize) {
            const size = Math.min(chunkSize, totalTrades - startIndex)
            promises.push(this.#runOnWorker(this.#workers[workerIdx++], {
                tradesObj,
                candlesObj,
                dataDir: this.dataDir,
                tpPercent: this.#tpPercent,
                slPercent: this.#slPercent,
                dayTsUs,
                startIndex,
                endIndex: startIndex + size,
                total: totalTrades
            }))
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
