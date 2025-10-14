class Ma {
    constructor (capacity, evaluatorFnc) {
        this.capacity = capacity
        this.evaluatorFnc = evaluatorFnc
        this.objects = []
        this.currentSum = 0
        this.currentCount = 0
        this.currentValue = 0
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
        return (this.currentValue = this.currentSum / this.currentCount)
    }

    pretend (obj, evaluatorFnc = null) {
        const value = (evaluatorFnc || this.evaluatorFnc)(obj)
        return (this.currentSum + value - (this.isReady ? this.objects[0].value : 0)) /
           (this.currentCount + (this.isReady ? 0 : 1))
    }
}

module.exports = Ma
