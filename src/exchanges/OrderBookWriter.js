import fs from 'fs'
import path from 'path'
import OrderBookFormat from '../core/OrderBookFormat.js'
import Day from '../utils/Day.js'

class WatchdogState {
    #lastWriteAtMs = 0
    #writeCallsCount = 0

    update () {
        this.#lastWriteAtMs = Date.now()
        this.#writeCallsCount++
    }

    get lastWriteAtMs () { return this.#lastWriteAtMs }
    get writeCallsCount () { return this.#writeCallsCount }
}

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
    #watchdogState = new WatchdogState()

    // ---- pause/resume state ----
    #paused = false
    #resuming = false
    #accumulatedData = []

    constructor ({ symbol, scaleExp, dataDir }) {
        this.#symbol = symbol
        this.#scaleExp = scaleExp
        this.#dataDir = dataDir
    }

    get watchdogState () { return this.#watchdogState }
    get pauseState () { return { paused: this.#paused, resuming: this.#resuming, accumulatedDataCount: this.#accumulatedData.length } }

    pause () {
        if (this.#paused) return
        if (this.#resuming) throw new Error('Cannot pause while resuming')
        this.#paused = true
        this.close()
    }

    resume () {
        if (!this.#paused) return
        if (this.#resuming) return
        this.#paused = false
        this.#resuming = true
        for (const data of this.#accumulatedData) {
            this.write(data)
        }
        this.#resuming = false
        this.#accumulatedData = []
    }

    write (data) {
        if (this.#paused) {
            this.#accumulatedData.push(data)
            this.#watchdogState.update()
            return
        }

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
        this.#watchdogState.update()
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
