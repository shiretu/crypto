class Candle {
    constructor (intervalInMinutes, tick) {
        this.intervalInMinutes = intervalInMinutes
        this.ticks = [tick]
        this.cachedInfo = null
    }

    get open () { return this.ticks[0] }
    get close () { return this.ticks[this.ticks.length - 1] }
    get direction () { return Math.sign(this.close.price - this.open.price) }
    get high () { return this.ticks.reduce((acc, curr) => acc.price < curr.price ? curr : acc, this.ticks[0]) }
    get low () { return this.ticks.reduce((acc, curr) => acc.price > curr.price ? curr : acc, this.ticks[0]) }

    get info () {
        if (this.cachedInfo) {
            return this.cachedInfo
        }
        const high = this.high
        const low = this.low
        const takers = this.ticks.filter(tick => !tick.isBuyerMaker)
        const direction = this.direction
        const height = Math.abs(this.open.price - this.close.price)
        let topWickPercent = 0
        let bottomWickPercent = 0
        if (direction !== 0) {
            if (direction < 0) {
                topWickPercent = (high.price - this.open.price) / height
                bottomWickPercent = (this.close.price - low.price) / height
            } else {
                topWickPercent = (high.price - this.close.price) / height
                bottomWickPercent = (this.open.price - low.price) / height
            }
        }
        this.cachedInfo = {
            ts: this.open.tsAsMinute * 60000000,
            intervalInMinutes: this.intervalInMinutes,
            open: this.open.price,
            close: this.close.price,
            high: high.price,
            low: low.price,
            baseVolume: this.ticks.reduce((acc, curr) => acc + curr.baseQty, 0),
            quoteVolume: this.ticks.reduce((acc, curr) => acc + curr.quoteQty, 0),
            takerBuyBaseVolume: takers.reduce((acc, curr) => acc + curr.baseQty, 0),
            takerBuyQuoteVolume: takers.reduce((acc, curr) => acc + curr.quoteQty, 0),
            tradesCount: this.ticks.length,
            direction,
            height,
            topWickPercent,
            bottomWickPercent
        }
        return this.cachedInfo
    }

    update (tick) {
        this.ticks.push(tick)
        this.cachedInfo = null
    }

    clone () {
        const result = Object.create(Candle.prototype)
        result.intervalInMinutes = this.intervalInMinutes
        result.ticks = structuredClone(this.ticks)
        return result
    }
}

module.exports = Candle
