const console = require('../utils/coloredConsole')

class NewWave {
    constructor (events) {
        this.events = events
        this.events.on('candleOpen', ({ candle, tick }) => this.#onCandleOpen(candle, tick))
        this.events.on('candleUpdate', ({ candle, tick }) => this.#onCandleUpdate(candle, tick))
        this.events.on('candleClose', ({ candle, tick }) => this.#onCandleClose(candle, tick))
        this.initLeg = []
        this.signalLeg = []
        this.decisionLeg = []
    }

    #reset (tsHr, reason) {
        console.log(tsHr, reason, `${this.initLeg.length} ${this.signalLeg.length} ${this.decisionLeg.length}`)
        this.initLeg = []
        this.signalLeg = []
        this.decisionLeg = []
    }

    #onCandleOpen (candle, tick) { }
    #onCandleUpdate (candle, tick) {}
    #onCandleClose (candleCurrent, tick) {
        if (candleCurrent.direction === 0) {
            this.#reset(candleCurrent.tsHr, 'Grey candle')
            return
        }
        if (this.initLeg.length === 0) {
            this.initLeg = [candleCurrent]
            return
        }

        if (this.signalLeg.length === 0) {
            if (this.initLeg.at(-1).direction === candleCurrent.direction) {
                this.initLeg.push(candleCurrent)
            } else {
                this.signalLeg = [candleCurrent]
            }
            return
        }

        if (this.signalLeg.at(-1).direction === candleCurrent.direction) {
            this.signalLeg.push(candleCurrent)
            return
        }

        this.decisionLeg.push(candleCurrent)

        this.#makeDecision(tick)
    }

    #makeDecision (tick) {
        this.#reset(this.initLeg[0].tsHr, `Evaluate ${this.initLeg[0].open.symbol.name()} ${this.signalLeg.at(-1).close.tsHr}`)
    }

    #switching (candleCurrent, tick) {
        const opposite = candleCurrent.direction > 0 ? this.reds : this.greens
        const current = candleCurrent.direction > 0 ? this.greens : this.reds
        if (opposite.length === 0) { throw new Error('We should not be here: how is this a switch with opposite having 0 length!?') }
        if (opposite.length < 2) {
            this.#reset(candleCurrent.tsHr, 'Switching too soon')
            return
        }
        if (current.length > 2) {
            this.#reset(candleCurrent.tsHr, 'The signal leg is too big')
            return
        }
        throw new Error('Switching')
    }
}

module.exports = NewWave

//  ETHUSDC 2025-10-16 21:11:01.252353 3852.503 --> 3852.017
//  ETHUSDC 2025-10-16 21:21:00.968035 3863.060 --> 3863.627
