const Ema = require('../instruments/Ema')
const MacdImpulse = require('../instruments/MacdImpulse')
const PeaksAndTroughs = require('../instruments/PeaksAndTroughs')
const console = require('../utils/coloredConsole')

class NewWave {
    constructor (events) {
        this.events = events
        this.events.on('candleOpen', ({ candle, tick }) => this.#onCandleOpen(candle, tick))
        this.events.on('candleUpdate', ({ candle, tick }) => this.#onCandleUpdate(candle, tick))
        this.events.on('candleClose', ({ candle, tick }) => this.#onCandleClose(candle, tick))
        this.ema = new Ema(9)
        this.macd = MacdImpulse.create(MacdImpulse.DefaultsConfig)
        this.hl = new PeaksAndTroughs()
    }

    #onCandleOpen (candle, tick) { }
    #onCandleUpdate (candle, tick) {}
    #onCandleClose (candle, tick) {
        // const value = this.ema.push(candle.close.price)
        const macd = this.macd.push(candle.close.price)
        const value = macd ? macd.macd : null
        if (value === null) { return }
        const v = this.hl.push(value)
        if (!v) return
        if (v.max) {
            console.green(`${tick.symbol.name()} ${candle.open.tsHr} ${value.toFixed(3)} --> ${v.max.toFixed(3)}`)
        } else {
            console.red(`${tick.symbol.name()} ${candle.open.tsHr} ${value.toFixed(3)} --> ${v.min.toFixed(3)}`)
        }
    }
}

module.exports = NewWave

//  ETHUSDC 2025-10-16 21:11:01.252353 3852.503 --> 3852.017
//  ETHUSDC 2025-10-16 21:21:00.968035 3863.060 --> 3863.627
