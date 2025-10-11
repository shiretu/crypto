class Candle {
    constructor (intervalInMinutes, tick) {
        this.intervalInMinutes = intervalInMinutes
        this.ticks = [tick]
    }

    get open () { return this.ticks[0] }
    get close () { return this.ticks[this.ticks.length - 1] }
    get high () { return this.ticks.reduce((acc, curr) => acc.price < curr.price ? curr : acc, this.ticks[0]) }
    get low () { return this.ticks.reduce((acc, curr) => acc.price > curr.price ? curr : acc, this.ticks[0]) }

    get info () {
        const takers = this.ticks.filter(tick => !tick.isBuyerMaker)
        return {
            ts: this.open.tsAsMinute * 60000000,
            intervalInMinutes: this.intervalInMinutes,
            open: this.open.price,
            close: this.close.price,
            high: this.high.price,
            low: this.low.price,
            baseVolume: this.ticks.reduce((acc, curr) => acc + curr.qty, 0),
            quoteVolume: this.ticks.reduce((acc, curr) => acc + curr.quoteQty, 0),
            takerBuyBaseVolume: takers.reduce((acc, curr) => acc + curr.qty, 0),
            takerBuyQuoteVolume: takers.reduce((acc, curr) => acc + curr.quoteQty, 0),
            tradesCount: this.ticks.length,
            direction: Math.sign(this.close.price - this.open.price),
            height: Math.abs(this.open.price - this.close.price)
        }
    }

    update (tick) { this.ticks.push(tick) }
    clone () {
        const result = Object.create(Candle.prototype)
        result.intervalInMinutes = this.intervalInMinutes
        result.ticks = structuredClone(this.ticks)
        return result
    }
}

module.exports = Candle
