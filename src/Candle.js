class Candle {
    constructor (maxDurationUs, tick) {
        this.maxDurationUs = maxDurationUs
        this.ticks = [tick]
    }

    get open () { return this.ticks[0] }
    get close () { return this.ticks[this.ticks.length - 1] }
    get high () { return this.ticks.reduce((acc, curr) => acc.price < curr.price ? curr : acc, this.ticks[0]) }
    get low () { return this.ticks.reduce((acc, curr) => acc.price > curr.price ? curr : acc, this.ticks[0]) }
    get volume () { return this.ticks.reduce((acc, curr) => acc + curr.quote_qty, 0) }
    get tradesCount () { return this.ticks.length }
    get direction () {
        // →  1 = up (green)
        // →  0 = flat (doji)
        // → -1 = down (red)
        return Math.sign(this.close.price - this.open.price)
    }

    get info () {
        return {
            date: this.open.ts,
            open: this.open.price,
            close: this.close.price,
            high: this.high.price,
            low: this.low.price,
            volume: this.volume,
            tradesCount: this.tradesCount,
            direction: this.direction,
            height: Math.abs(this.open.price - this.close.price)
        }
    }

    wouldClose (tsUs) { return (tsUs - this.open.ts_us) > this.maxDurationUs }
    update (tick) { this.ticks.push(tick) }
}

module.exports = Candle
