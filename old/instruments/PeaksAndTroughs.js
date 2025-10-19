class PeaksAndTroughs {
    constructor (epsilon) {
        this.epsilon = Math.abs(epsilon) ?? 0
        this.currentValue = null
        this.startPoint = null
        this.currentPoint = null
    }

    get value () { return this.currentValue }
    get isReady () { return this.currentValue != null }

    push (newPoint) {
        // do we have a start point?
        if (this.startPoint === null) {
            this.startPoint = newPoint
            return null
        }

        // is the start point the same as the new point?
        if (this.startPoint === newPoint) { return null }

        // do we have a current point?
        if (this.currentPoint === null) {
            this.currentPoint = newPoint
            return null
        }

        // is the current point the same as the new point?
        const newDiff = newPoint - this.currentPoint
        if (Math.abs(newDiff) <= this.epsilon) { return null }

        // compute the current diff
        const currentDiff = this.currentPoint - this.startPoint

        // if the sign is the diffs is the same, that means same trend: update the current and we are done
        if (Math.sign(currentDiff) === Math.sign(newDiff)) {
            this.currentPoint = newPoint
            return null
        }

        // the sign is different. That means we just created a trough or a peak
        this.currentValue = (currentDiff > 0) ? { max: this.currentPoint } : { min: this.currentPoint }
        this.startPoint = this.currentPoint
        this.currentPoint = newPoint

        // done
        return this.currentValue
    }
}

module.exports = PeaksAndTroughs
