/* global WebSocket */
import OrderBookQueue from './OrderBookQueue.js'
import OrderBookWriter from './OrderBookWriter.js'

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
        this.#queue = new OrderBookQueue()
        this.#writer = new OrderBookWriter({
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
    get watchdogState () { return this.#writer ? this.#writer.watchdogState : null }

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

        this.#queue = new OrderBookQueue()

        if (this.#writer) {
            const local = this.#writer
            this.#writer = new OrderBookWriter({
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
