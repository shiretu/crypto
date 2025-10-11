const Candle = require('./Candle')

class Candles {
    constructor (events, intervalInMinutes) {
        this.intervalInMinutes = intervalInMinutes
        this.events = events
        this.events.on('tick', (tick) => this.#onTick(tick))
        this.candle = null
    }

    #onTick (tick) {
        if (!this.candle) {
            this.candle = new Candle(this.intervalInMinutes, tick)
            this.events.emit('candleOpen', { candle: this.candle, tick })
            return
        }
        if (this.candle.close.tsAsMinute !== tick.tsAsMinute) {
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
