/* global WebSocket */
import fs from 'fs'
import path from 'path'
import OrdersBookFormat from '../core/OrdersBookFormat.js'
import Day from '../utils/Day.js'

class Queue {
    #items = []
    #expectedNextUpdateId = null
    #viableSnapshot = null

    enqueueDiff ({
        a: asks,
        b: bids,
        // e: eventType,
        E: eventTime,
        // s: symbol,
        U: firstUpdateId,
        u: lastUpdateId
    }, writerCallback) {
        const getNextExpectedId = () => {
            if (this.#expectedNextUpdateId !== null) return this.#expectedNextUpdateId
            if (this.#items.length === 0) return null
            return this.#items.at(-1).lastUpdateId + 1
        }
        const nextExpectedId = getNextExpectedId()
        if (nextExpectedId !== null) {
            if (lastUpdateId < nextExpectedId) {
                // This update is too old; we can ignore it.
                return
            }
            if (firstUpdateId > nextExpectedId) {
                // We've missed some updates; this is a gap. We should trigger a resync.
                throw new Error(`Sequence gap detected: expected updateId ${nextExpectedId}, got firstUpdateId ${firstUpdateId}`)
            }
        }
        // at this point, the update is good. We will save it directly if we have a valid #expectedNextUpdateId
        // or we will buffer it until we get a snapshot that sets #expectedNextUpdateId to a value that allows us
        // to apply this update.
        const record = { isDiff: true, eventTime, firstUpdateId, lastUpdateId, bids, asks }
        if (this.#expectedNextUpdateId === null) {
            this.#items.push(record)
            return
        }
        if (this.#viableSnapshot) {
            this.#viableSnapshot.eventTime = Math.min(this.#viableSnapshot.eventTime, eventTime)
            writerCallback(this.#viableSnapshot)
            this.#viableSnapshot = null
        }
        writerCallback(record)
        this.#expectedNextUpdateId = lastUpdateId + 1
    }

    enqueueSnapshot (data, writerCallback) {
        const now = Date.now()
        if ((this.#expectedNextUpdateId === null) && (this.#items.length === 0)) {
            throw new Error('Queue is pristine: cannot enqueue snapshot before any diff has been received (no anchor and no buffered diffs to align against). This indicates a lifecycle bug in the caller — the caller is expected to enqueue at least one diff before requesting the first snapshot.')
        }
        if ((this.#expectedNextUpdateId !== null) && (this.#items.length > 0)) {
            throw new Error('Queue invariant violated: buffer is non-empty while an anchor is set. Items are only buffered during bootstrap; once anchored, diffs must be written or discarded, never queued.')
        }
        if (this.#expectedNextUpdateId === null) {
            this.#processSnapshotInitial({ ...data, eventTime: now }, writerCallback)
            return
        }
        this.#processSnapshotPeriodic({ ...data, eventTime: now }, writerCallback)
    }

    #processSnapshotInitial ({ lastUpdateId, bids, asks, eventTime }, writerCallback) {
        const firstBufferedUpdateId = this.#items[0].firstUpdateId
        const lastBufferedUpdateId = this.#items.at(-1).lastUpdateId

        if ((lastUpdateId + 1) < firstBufferedUpdateId) {
            throw new Error('Snapshot too old')
        }

        const record = { isDiff: false, eventTime, firstUpdateId: lastUpdateId, lastUpdateId, bids, asks }
        if (lastBufferedUpdateId <= lastUpdateId) {
            this.#items = []
            this.#expectedNextUpdateId = lastUpdateId + 1
            this.#viableSnapshot = record
            return
        }

        const viableDiffs = this.#items.filter((item) => item.lastUpdateId > lastUpdateId)
        record.eventTime = Math.min(record.eventTime, viableDiffs[0].eventTime)

        writerCallback(record)
        for (const diff of viableDiffs) {
            writerCallback(diff)
        }
        this.#expectedNextUpdateId = lastBufferedUpdateId + 1
        this.#items = []
    }

    #processSnapshotPeriodic ({ lastUpdateId, bids, asks, eventTime }, writerCallback) {
        if (lastUpdateId < this.#expectedNextUpdateId) { return }
        this.#expectedNextUpdateId = lastUpdateId + 1
        this.#viableSnapshot = { isDiff: false, eventTime, firstUpdateId: lastUpdateId, lastUpdateId, bids, asks }
    }
}

class Writer {
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

    constructor ({ symbol, scaleExp, dataDir }) {
        this.#symbol = symbol
        this.#scaleExp = scaleExp
        this.#dataDir = dataDir
    }

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

        const { buf, size } = OrdersBookFormat.encode({ ...data, scaleExp: this.#scaleExp }, this.#writeBuf)
        this.#writeBuf = buf

        fs.writeSync(this.#currentFd, buf, 0, size)

        this.#lastStoredLastUpdateId = data.lastUpdateId
        this.#lastStoredEventTime = data.eventTime
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

export default class BinanceOrderBookCollector {
    // ---- config ----
    #symbol
    #scaleExp
    #snapshotDepth
    #snapshotIntervalMs
    #statusIntervalMs
    #dataDir
    #wsUrl
    #restUrl

    // ---- state ----
    #lastRestartTimestamp
    #pendingRestartTimer
    #ws
    #snapshotPromiseId
    #periodicSnapshotTimer

    // ---- queue ----
    #queue

    // ---- Writer ----
    #writer

    /**
     * All fields are required — the class never assumes defaults.
     * The CLI (or whatever caller) is responsible for supplying values.
     *
     * @param {Object} cfg
     * @param {Object} cfg.symbol               - resolved Symbol instance (must be on binance)
     * @param {number} cfg.scaleExp             - price/qty scale exponent (10^scaleExp), 0..15
     * @param {number} cfg.snapshotDepth        - levels per side in each snapshot record (>0)
     * @param {number} cfg.snapshotIntervalSec  - cadence of in-day re-snapshots (>0)
     * @param {number} cfg.statusIntervalSec    - cadence of status log line (>0)
     * @param {string} cfg.dataDir              - root directory for day files
     */
    constructor ({ symbol, scaleExp, snapshotDepth, snapshotIntervalSec, statusIntervalSec, dataDir }) {
        if (!symbol) throw new Error('symbol is required')
        if (symbol.exchange.id !== 'binance') {
            throw new Error(`BinanceOrderBookCollector requires a binance symbol, got: ${symbol.exchange.id}`)
        }
        if (!Number.isInteger(scaleExp) || scaleExp < 0 || scaleExp > 15) {
            throw new Error(`scaleExp must be an integer in [0,15], got: ${scaleExp}`)
        }
        if (!Number.isInteger(snapshotDepth) || snapshotDepth <= 0) {
            throw new Error(`snapshotDepth must be a positive integer, got: ${snapshotDepth}`)
        }
        if (!Number.isFinite(snapshotIntervalSec) || snapshotIntervalSec <= 0) {
            throw new Error(`snapshotIntervalSec must be a positive number, got: ${snapshotIntervalSec}`)
        }
        if (!Number.isFinite(statusIntervalSec) || statusIntervalSec <= 0) {
            throw new Error(`statusIntervalSec must be a positive number, got: ${statusIntervalSec}`)
        }
        if (typeof dataDir !== 'string' || dataDir.length === 0) {
            throw new Error(`dataDir must be a non-empty string, got: ${dataDir}`)
        }
        this.#symbol = symbol
        this.#scaleExp = scaleExp
        this.#snapshotDepth = snapshotDepth
        this.#snapshotIntervalMs = snapshotIntervalSec * 1000
        this.#statusIntervalMs = statusIntervalSec * 1000
        this.#dataDir = dataDir

        const upperSym = `${symbol.base.id}${symbol.quote.id}`.toUpperCase()
        const lowerSym = upperSym.toLowerCase()
        this.#wsUrl = `wss://stream.binance.com:9443/ws/${lowerSym}@depth@100ms`
        this.#restUrl = `https://api.binance.com/api/v3/depth?symbol=${upperSym}&limit=${snapshotDepth}`

        this.#lastRestartTimestamp = 0
        this.#pendingRestartTimer = null
        this.#ws = null
        this.#snapshotPromiseId = null
        this.#periodicSnapshotTimer = null
        this.#queue = new Queue()
        this.#writer = new Writer({
            symbol: this.#symbol,
            scaleExp: this.#scaleExp,
            dataDir: this.#dataDir
        })
    }

    get symbol () { return this.#symbol }
    get wsUrl () { return this.#wsUrl }
    get restUrl () { return this.#restUrl }
    get scaleExp () { return this.#scaleExp }
    get snapshotDepth () { return this.#snapshotDepth }
    get snapshotIntervalSec () { return this.#snapshotIntervalMs / 1000 }

    /** Start the collector: open WS, kick off bootstrap, start status timer. */
    start () {
        this.#restart(null)
    }

    stop () {
        if (this.#pendingRestartTimer) {
            const local = this.#pendingRestartTimer
            this.#pendingRestartTimer = null
            clearTimeout(local)
        }

        if (this.#periodicSnapshotTimer) {
            const local = this.#periodicSnapshotTimer
            this.#periodicSnapshotTimer = null
            clearInterval(local)
        }

        if (this.#ws) {
            const local = this.#ws
            this.#ws = null
            local.onopen = null
            local.onmessage = null
            local.onclose = null
            local.onerror = null
            local.close()
        }

        this.#snapshotPromiseId = null

        this.#queue = new Queue()

        if (this.#writer) {
            const local = this.#writer
            this.#writer = new Writer({
                symbol: this.#symbol,
                scaleExp: this.#scaleExp,
                dataDir: this.#dataDir
            })
            local.close()
        }
    }

    #logInfo (message) {
        const now = new Date()
        console.info(`[${now.toISOString()}] ${message}`)
    }

    #logWarn (message) {
        const now = new Date()
        console.warn(`[${now.toISOString()}] ${message}`)
    }

    #restart (reason) {
        if (reason) {
            this.#logWarn(`Restarting collector: ${reason}`)
        }
        if (this.#pendingRestartTimer) return
        this.stop()
        const wait = Math.max(0, 5000 - (Date.now() - this.#lastRestartTimestamp))
        this.#pendingRestartTimer = setTimeout(() => {
            this.#pendingRestartTimer = null
            this.#lastRestartTimestamp = Date.now()
            this.#startWs()
            // this.#startSnapshot()
        }, wait)
    }

    #startWs () {
        this.#ws = new WebSocket(this.#wsUrl)
        this.#ws.onopen = () => { this.#logInfo('WebSocket connected') }
        this.#ws.onmessage = (event) => { try { this.#handleWsMessage(event) } catch (e) { this.#restart(e) } }
        this.#ws.onclose = (event) => { this.#restart(new Error(`WebSocket closed with code ${event.code}, reason: ${event.reason}`)) }
        this.#ws.onerror = (event) => { this.#restart(new Error(`WebSocket error: ${event.message || 'unknown error'}`)) }
    }

    #startSnapshot () {
        if (this.#snapshotPromiseId) { return }
        const currentPromiseId = Date.now()
        this.#snapshotPromiseId = currentPromiseId
        fetch(this.#restUrl)
            .then((response) => {
                if (this.#snapshotPromiseId !== currentPromiseId) { return }
                if (!response.ok) {
                    throw new Error(`Snapshot REST request failed with status ${response.status}: ${response.statusText}`)
                }
                return response.json()
            })
            .then((data) => {
                if (this.#snapshotPromiseId !== currentPromiseId) { return }
                this.#handleRestSnapshot(data)
                if (!this.#periodicSnapshotTimer) {
                    this.#periodicSnapshotTimer = setInterval(() => {
                        this.#startSnapshot()
                    }, this.#snapshotIntervalMs)
                }
            })
            .catch((error) => {
                if (this.#snapshotPromiseId !== currentPromiseId) { return }
                this.#restart(error)
            })
            .finally(() => {
                if (this.#snapshotPromiseId !== currentPromiseId) { return }
                this.#snapshotPromiseId = null
            })
    }

    #handleWsMessage (event) {
        if (this.#periodicSnapshotTimer === null) {
            this.#startSnapshot()
        }
        const data = JSON.parse(event.data)
        this.#queue.enqueueDiff(data, (data) => { this.#writer.write(data) })
    }

    #handleRestSnapshot (data) {
        // const isFirstSnapshot = this.#periodicSnapshotTimer === null
        this.#queue.enqueueSnapshot(data, (data) => { this.#writer.write(data) })
    }
}
