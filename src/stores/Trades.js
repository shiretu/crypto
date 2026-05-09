import Store from './Store.js'
import Trade from '../core/Trade.js'
import { resolveSymbol } from '../core/resolveSymbol.js'

export default class Trades extends Store {
    constructor (dataDir, symbol) {
        super(dataDir, symbol, 'trades', Trade.RECORD_SIZE)
    }

    async computeDayBuffer (dayTsUs) {
        const downloader = this.symbol.exchange.downloader
        if (!downloader) throw new Error(`No downloader for exchange ${this.symbol.exchange.id}`)
        return await downloader.downloadDay(this.symbol, dayTsUs)
    }

    makeRecord (buf, offset, dayIndex, absoluteIndex) {
        return new Trade(buf.subarray(offset, offset + this.recordSize), dayIndex, absoluteIndex)
    }

    static fromAnonymousObject (obj) {
        const store = new Trades(obj.dataDir, resolveSymbol(obj.symbolId))
        store._restoreFrom(obj)
        return store
    }
}
