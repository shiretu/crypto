class Sma {
    constructor (capacity) {
        this.capacity = capacity
        this.objects = []
        this.currentSum = 0
        this.currentCount = 0
        this.currentValue = 0
    }

    get value () { return this.currentValue }
    get isReady () { return this.objects.length === this.capacity }

    push (value) {
        this.currentSum += value
        this.objects.push(value)
        if (this.objects.length > this.capacity) {
            this.currentSum -= this.objects[0]
            this.objects.shift()
        } else {
            this.currentCount = this.objects.length
        }
        return (this.currentValue = this.currentSum / this.currentCount)
    }

    pretend (value) {
        return (this.currentSum + value - (this.isReady ? this.objects[0] : 0)) /
           (this.currentCount + (this.isReady ? 0 : 1))
    }
}

module.exports = Sma
