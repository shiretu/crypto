const Candle = require('./Candle')

class Candles {
    constructor (events, intervalInMinutes) {
        this.period = intervalInMinutes * 60000000
        this.events = events
        this.events.on('tick', (tick) => this.#onTick(tick))
        this.candle = null
        this.totalTicks = 0
        this.totalCandles = 0
    }

    #onTick (tick) {
        this.totalTicks++
        tick.periodTs = Math.floor(tick.ts / this.period)
        if (!this.candle) {
            this.totalCandles++
            this.candle = new Candle(this.intervalInMinutes, tick)
            this.events.emit('candleOpen', { candle: this.candle, tick })
            return
        }
        // if ((this.candle.close.tsAsHour !== tick.tsAsHour)) {
        //     console.log(tick.tsHr, this.totalTicks, this.totalCandles)
        // }
        if (this.candle.close.periodTs !== tick.periodTs) {
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
