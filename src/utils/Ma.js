class Ma {
    constructor (capacity, evaluatorFnc) {
        this.capacity = capacity
        this.evaluatorFnc = evaluatorFnc
        this.objects = []
        this.currentSum = 0
        this.currentCount = 0
        this.currentValue = 0
        this.values = []
    }

    get value () { return this.currentValue }
    get isReady () { return this.objects.length === this.capacity }

    push (obj, evaluatorFnc = null) {
        const value = (evaluatorFnc || this.evaluatorFnc)(obj)
        this.currentSum += value
        this.objects.push({ value, obj })
        if (this.objects.length > this.capacity) {
            this.currentSum -= this.objects[0].value
            this.objects.shift()
        } else {
            this.currentCount = this.objects.length
        }
        this.currentValue = this.currentSum / this.currentCount
        this.values.push(this.currentValue)
        if (this.values.length > this.capacity) { this.values.shift() }
        return this.currentValue
    }

    pretend (obj, evaluatorFnc = null) {
        const value = (evaluatorFnc || this.evaluatorFnc)(obj)
        return (this.currentSum + value - (this.isReady ? this.objects[0].value : 0)) /
           (this.currentCount + (this.isReady ? 0 : 1))
    }

    oldValue (k) {
        const idx = this.values.length - 1 - k
        return idx >= 0 ? this.values[idx] : null
    }

    slopeOver (k) {
        if (k <= 0) return 0
        const oldValue = this.oldValue(k)
        return oldValue == null ? null : ((this.currentValue - oldValue) / k)
    }

    slopeBpsOver (k) {
        if (k <= 0) return 0
        const oldValue = this.oldValue(k)
        if (oldValue == null || oldValue === 0) return null
        const perBar = (this.currentValue - oldValue) / k
        return (perBar / oldValue) * 10_000
    }
}

module.exports = Ma
