import { parentPort } from 'worker_threads'
import OutcomesComputer from './OutcomesComputer.js'
import { fromCandleRef } from '../core/Candle.js'
import Trades from './Trades.js'
import Candles from './Candles.js'

const progressMsg = { type: 'progress', index: 0 }

parentPort.on('message', async (msg) => {
    const { tradesObj, candlesObj, dataDir, tpPercent, slPercent, dayTsUs, startIndex, endIndex } = msg

    try {
        const tradesStore = Trades.fromAnonymousObject(tradesObj)
        const candlesStore = Candles.fromAnonymousObject(candlesObj, tradesStore)

        const trades = tradesStore.getDay(dayTsUs)
        const candles = candlesStore.getDay(dayTsUs).map(ref => fromCandleRef(ref, candlesStore.durationSec, tradesStore))

        const result = await OutcomesComputer.compute({
            dataDir,
            symbol: tradesStore.symbol,
            tpPercent,
            slPercent,
            trades,
            candles,
            startIndex,
            endIndex,
            progressCallback: (index) => {
                progressMsg.index = index
                parentPort.postMessage(progressMsg)
            }
        })

        parentPort.postMessage({ type: 'done', buffer: result })
    } catch (err) {
        parentPort.postMessage({ type: 'error', message: err.message, stack: err.stack })
    }
})
