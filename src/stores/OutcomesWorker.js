import { parentPort, workerData } from 'worker_threads'
import OutcomesComputer from './OutcomesComputer.js'
import { fromCandleRef } from '../core/Candle.js'
import Trades from './Trades.js'
import Candles from './Candles.js'

const {
    tradesObj,
    candlesObj,
    dataDir,
    tpPercent,
    slPercent,
    dayTsUs,
    startIndex,
    endIndex
} = workerData

const tradesStore = Trades.fromAnonymousObject(tradesObj)
const candlesStore = Candles.fromAnonymousObject(candlesObj, tradesStore)

const CANDLE_DURATION_SEC = candlesStore.durationSec

const trades = tradesStore.getDay(dayTsUs)
const candles = candlesStore.getDay(dayTsUs).map(ref => fromCandleRef(ref, CANDLE_DURATION_SEC, tradesStore))

const progressMsg = { type: 'progress', index: 0 }

// Run computation
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
