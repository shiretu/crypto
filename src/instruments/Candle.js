const { bigIntSign, bigIntAbs } = require('../utils/utils')

class Candle {
    constructor (maxDurationUs, tick) {
        this.maxDurationUs = maxDurationUs
        this.ticks = [tick]
    }

    get open () { return this.ticks[0] }
    get close () { return this.ticks[this.ticks.length - 1] }
    get high () { return this.ticks.reduce((acc, curr) => acc.price < curr.price ? curr : acc, this.ticks[0]) }
    get low () { return this.ticks.reduce((acc, curr) => acc.price > curr.price ? curr : acc, this.ticks[0]) }
    get volume () { return this.ticks.reduce((acc, curr) => acc + curr.quote_qty, 0n) }
    get tradesCount () { return this.ticks.length }
    get direction () {
        // →  1 = up (green)
        // →  0 = flat (doji)
        // → -1 = down (red)
        return bigIntSign(this.close.price - this.open.price)
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
            height: bigIntAbs(this.open.price - this.close.price)
        }
    }

    wouldClose (tsUs) {
        const duration = tsUs - this.open.ts
        return duration >= this.maxDurationUs
    }

    update (tick) { this.ticks.push(tick) }
    clone () {
        const c = Object.create(Candle.prototype)
        c.maxDurationUs = this.maxDurationUs
        c.ticks = structuredClone(this.ticks)
        return c
    }

    static merge (candles) {
        const result = new Candle(this.maxDurationUs, null)
        result.ticks = candles.map(candle => candle.ticks).flat()
        return result
    }
}

module.exports = Candle
