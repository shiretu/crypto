class History {
    constructor (capacity) {
        this.capacity = capacity < 2 ? 2 : capacity
        this.items = []
    }

    get isReady () { return this.items.length === this.capacity }

    push (value) {
        this.items.push(value)
        if (this.items.length > this.capacity) { this.items.shift() }
    }

    slope (k, asBps = false) {
        if (!this.isReady) { return null }
        k = Math.max(2, Math.min(k, this.items.length))
        const oldest = this.items[this.items.length - k]
        const diff = this.items.at(-1) - oldest
        const slope = diff / (k - 1)
        if (!asBps) { return slope }
        if (oldest === 0) return null
        return (slope / oldest) * 10_000
    }
}

module.exports = History
