import Store from './Store.js'
import { OutcomeRef } from '../core/Outcome.js'
import { fromCandleRef } from '../core/Candle.js'
import OutcomesComputer from './OutcomesComputer.js'

export default class Outcomes extends Store {
    #tpPercent
    #slPercent
    #tradesStore
    #candlesStore

    constructor (dataDir, symbol, tpPercent, slPercent, tradesStore, candlesStore) {
        super(dataDir, symbol, 'outcomes', OutcomeRef.RECORD_SIZE, [`${tpPercent}`, `${slPercent}`])
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
        this.#tradesStore = tradesStore
        this.#candlesStore = candlesStore
    }

    async computeDayBuffer (dayTsUs) {
        const trades = this.#tradesStore.getDay(dayTsUs)
        if (trades.length === 0) return Buffer.alloc(0)

        const candles = this.#candlesStore.getDay(dayTsUs).map(ref => fromCandleRef(ref, this.#candlesStore.durationSec, this.#tradesStore))
        if (candles.length === 0) return Buffer.alloc(0)

        const progress = { type: 'progress', dayTsUs, total: trades.length, chunkStart: 0, chunkSize: 0, processed: 0 }
        const generalProgress = (chunkStart, chunkSize, currentIndex) => {
            if ((currentIndex % 1000 === 0) || (currentIndex === chunkStart + chunkSize)) {
                progress.chunkStart = chunkStart
                progress.chunkSize = chunkSize
                progress.processed = currentIndex - chunkStart
                this.emit(progress)
            }
        }

        const cpusCount = 12
        const workersCount = cpusCount * 4
        const chunkSize = Math.ceil(trades.length / workersCount)
        const promises = []
        for (let startIndex = 0; startIndex < trades.length; startIndex += chunkSize) {
            const size = Math.min(chunkSize, trades.length - startIndex)
            promises.push(OutcomesComputer.compute({
                dataDir: this.dataDir,
                symbol: this.symbol,
                tpPercent: this.#tpPercent,
                slPercent: this.#slPercent,
                trades,
                candles,
                startIndex,
                endIndex: startIndex + size,
                progressCallback: index => generalProgress(startIndex, size, index)
            }))
        }
        const buffers = await Promise.all(promises)
        return Buffer.concat(buffers)
    }

    makeRecord (buf, offset, dayIndex, absoluteIndex) {
        return new OutcomeRef(buf.subarray(offset, offset + this.recordSize))
    }
}
