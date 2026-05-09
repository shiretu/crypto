import Store from './Store.js'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { Worker } from 'worker_threads'
import { OutcomeRef } from '../core/Outcome.js'
import Trades from './Trades.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WORKER_PATH = path.join(__dirname, 'OutcomesWorker.js')

export default class Outcomes extends Store {
    #tpPercent
    #slPercent

    constructor (dataDir, symbol, tpPercent, slPercent) {
        super(dataDir, symbol, 'outcomes', OutcomeRef.RECORD_SIZE, [`${tpPercent}`, `${slPercent}`])
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
    }

    async computeDayBuffer (dayTsUs) {
        throw new Error('Not yet implemented')
    }

    makeRecord (buf, offset, dayIndex, absoluteIndex) {
        throw new Error('Not yet implemented')
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
