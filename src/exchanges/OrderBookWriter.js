import fs from 'fs'
import path from 'path'
import OrderBookFormat from '../core/OrderBookFormat.js'
import Day from '../utils/Day.js'

export default class OrderBookWriter {
    // ---- config ----
    #symbol
    #scaleExp
    #dataDir

    // ---- state ----
    #currentDayUs = null
    #currentFd = null
    #lastStoredLastUpdateId = null
    #lastStoredEventTime = null
    #writeBuf = null
    #lastWriteAtMs = 0
    #savedRecordsCount = 0

    constructor ({ symbol, scaleExp, dataDir }) {
        this.#symbol = symbol
        this.#scaleExp = scaleExp
        this.#dataDir = dataDir
    }

    get lastWriteAtMs () { return this.#lastWriteAtMs }
    get savedRecordsCount () { return this.#savedRecordsCount }

    write (data) {
        if (this.#lastStoredLastUpdateId !== null) {
            if (data.firstUpdateId !== this.#lastStoredLastUpdateId + 1) {
                throw new Error(`Store sequence not back-to-back: previous lastUpdateId=${this.#lastStoredLastUpdateId}, incoming firstUpdateId=${data.firstUpdateId} (expected ${this.#lastStoredLastUpdateId + 1})`)
            }
            if (data.eventTime < this.#lastStoredEventTime) {
                throw new Error(`Store time regression: previous eventTime=${this.#lastStoredEventTime}, incoming eventTime=${data.eventTime}`)
            }
        }

        const dayUs = Day.fromTsUs(data.eventTime * 1000)
        if (dayUs !== this.#currentDayUs) {
            if (this.#currentFd !== null) {
                const localFd = this.#currentFd
                this.#currentFd = null
                fs.closeSync(localFd)
            }
            const filePath = this.#dayFilePath(dayUs)
            fs.mkdirSync(path.dirname(filePath), { recursive: true })
            this.#currentFd = fs.openSync(filePath, 'a')
            this.#currentDayUs = dayUs
        }

        const { buf, size } = OrderBookFormat.encode({ ...data, scaleExp: this.#scaleExp }, this.#writeBuf)
        this.#writeBuf = buf

        fs.writeSync(this.#currentFd, buf, 0, size)

        this.#lastStoredLastUpdateId = data.lastUpdateId
        this.#lastStoredEventTime = data.eventTime
        this.#lastWriteAtMs = Date.now()
        this.#savedRecordsCount++
    }

    close () {
        if (this.#currentFd !== null) {
            const localFd = this.#currentFd
            this.#currentFd = null
            try { fs.closeSync(localFd) } catch (_) { /* swallow — best-effort cleanup */ }
        }
        this.#currentDayUs = null
        this.#lastStoredLastUpdateId = null
        this.#lastStoredEventTime = null
    }

    #dayFilePath (dayTsUs) {
        const d = new Date(dayTsUs / 1000)
        const y = String(d.getUTCFullYear())
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        return path.join(this.#dataDir,
            'orderBooks',
            this.#symbol.exchange.id,
            this.#symbol.base.id,
            this.#symbol.quote.id,
            y,
            m,
            `${dd}.bin`
        )
    }
}
