class Ma {
    constructor (capacity, evaluatorFnc) {
        this._capacity = capacity
        this.evaluatorFnc = evaluatorFnc
        this.objects = []
        this.currentSum = 0
        this.currentCount = 0
        this.currentValue = 0
    }

    get value () { return this.currentValue }
    get length () { return this.objects.length }
    get capacity () { return this._capacity }
    get isComplete () { return this.objects.length === this._capacity }

    push (obj, evaluatorFnc = null) {
        const value = (evaluatorFnc || this.evaluatorFnc)(obj)
        this.currentSum += value
        this.objects.push({ value, obj })
        if (this.objects.length > this._capacity) {
            this.currentSum -= this.objects[0].value
            this.objects.shift()
        } else {
            this.currentCount = this.objects.length
        }
        this.currentValue = this.currentSum / this.currentCount
        return this.currentValue
    }
}

module.exports = Ma
