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
            this.events.emit('candleOpen', this.candle)
            return
        }
        if (this.candle.wouldClose(tick.ts_us)) {
            this.events.emit('candleClose', this.candle)
            this.candle = null
            this.#onTick(tick)
            return
        }
        this.candle.update(tick)
        this.events.emit('candleUpdate', this.candle)
    }
}

module.exports = Candles
