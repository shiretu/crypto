export default class OrderBookQueue {
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
