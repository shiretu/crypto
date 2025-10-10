const Candle = require('./Candle')

class Candles {
    constructor (events, maxDurationUs) {
        this.maxDurationUs = maxDurationUs
        this.events = events
        this.events.on('tick', (tick) => this.#onTick(tick))
        this.candle = null
    }

    #onTick (tick) {
        if (!this.candle) {
            this.candle = new Candle(this.maxDurationUs, tick)
            this.events.emit('candleOpen', { candle: this.candle, tick })
            return
        }
        if (this.candle.wouldClose(tick.ts)) {
            const info = this.candle.info
            console.log({ open: info.open, high: info.high, low: info.low, close: info.close, C: info.direction })
            this.events.emit('candleClose', { candle: this.candle, tick })
            this.candle = null
            this.#onTick(tick)
            return
        }
        this.candle.update(tick)
        this.events.emit('candleUpdate', { candle: this.candle, tick })
    }
}

module.exports = Candles
