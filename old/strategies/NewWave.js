const console = require('../utils/coloredConsole')
const path = require('path')
const { generateAndSavePng } = require('../utils/CandlesPrinter')
const Order = require('../core/Order')
const Printer = require('../utils/Printer')

class NewWave {
    constructor (events) {
        this.events = events
        this.events.on('candleClose', ({ candle, tick }) => this.#onCandleClose(candle, tick))
        this.initLeg = []
        this.signalLeg = []
        this.decisionLeg = []
        this.order = null
        this.events.on('orderClosed', (order) => { if (order.id === this.order.id) this.order = null })
    }

    #reset (tsHr, reason) {
        this.initLeg = []
        this.signalLeg = []
        this.decisionLeg = []
    }

    #onCandleClose (candleCurrent, tick) {
        // don't do anything if we are disabled
        if (this.order !== null) return

        // on a grey candle, we give up; they do not happen too often anyways. This simplifies things
        if (candleCurrent.direction === 0) {
            this.#reset(candleCurrent.tsHr, 'Grey candle')
            return
        }

        // start the first leg when empty
        if (this.initLeg.length === 0) {
            this.initLeg = [candleCurrent]
            return
        }

        // contribute to first leg or start the signal leg
        if (this.signalLeg.length === 0) {
            if (this.initLeg.at(-1).direction === candleCurrent.direction) {
                this.initLeg.push(candleCurrent)
            } else {
                this.signalLeg = [candleCurrent]
            }
            return
        }

        // continue to push to signal leg
        if (this.signalLeg.at(-1).direction === candleCurrent.direction) {
            this.signalLeg.push(candleCurrent)
            return
        }

        // decision leg started
        this.decisionLeg.push(candleCurrent)

        // make the decision
        this.#makeDecision(tick)
    }

    #cycle (reason) {
        const p = new Printer()
        p.addCandles([...this.initLeg, ...this.signalLeg, ...this.decisionLeg])
        p.print(path.resolve(path.join(__dirname, '..', '..', 'trades', this.initLeg[0].open.symbol.name()), reason, `${this.initLeg[0].tsHr}.png`), this.initLeg[0].symbolName)
        // const imagePath = path.resolve(path.join(__dirname, '..', '..', 'trades', this.initLeg[0].open.symbol.name()), reason, `${this.initLeg[0].tsHr}.png`)
        // generateAndSavePng(imagePath, [...this.initLeg.map(c => c.info), ...this.signalLeg.map(c => c.info), ...this.decisionLeg.map(c => c.info)])
        this.initLeg = this.signalLeg
        this.signalLeg = this.decisionLeg
        this.decisionLeg = []
    }

    #makeDecision (tick) {
        // the first leg must be long enough
        if (this.initLeg.length < 2) {
            this.#cycle('initLegTooShort')
            return
        }

        // the first leg must not be too long
        if (this.initLeg.length > 3) {
            this.#cycle('initLegTooLong')
            return
        }

        // the second (signal) leg must not bee too long
        if (this.signalLeg.length >= 3) {
            this.#cycle('signalLegTooBig')
            return
        }

        // find the half of the first leg
        const lowestLow = Math.min(...this.initLeg.map(candle => candle.info.low))
        const heighestHigh = Math.max(...this.initLeg.map(candle => candle.info.high))
        const initLegHeight = heighestHigh - lowestLow
        const initLegLimit = initLegHeight / 2 + lowestLow
        if (this.initLeg[0].direction > 0) {
            const signalLegLowestLow = Math.min(...this.signalLeg.map(candle => candle.info.low))
            if (signalLegLowestLow < initLegLimit) {
                this.#cycle('signalLegTooFar')
                return
            }
        } else {
            const signalLegHeighestHigh = Math.max(...this.signalLeg.map(candle => candle.info.high))
            if (signalLegHeighestHigh > initLegLimit) {
                this.#cycle('signalLegTooFar')
                return
            }
        }

        // check and see if the init leg has increasing volumes
        if (this.initLeg.at(-2).info.quoteVolume >= this.initLeg.at(-1).info.quoteVolume) {
            this.#cycle('initLegWithWrongVolumes')
            return
        }

        // check and see if the signal leg has decreasing volumes
        if (this.initLeg.at(-1).info.quoteVolume <= this.signalLeg[0].info.quoteVolume) {
            this.#cycle('signalLegStartedWithWrongVolume')
            return
        }
        for (let i = 1; i < this.signalLeg.length; i++) {
            if (this.signalLeg[i - 1].info.quoteVolume <= this.signalLeg[i].info.quoteVolume) {
                this.#cycle('signalLegWithWrongVolumes')
                return
            }
        }

        // alright, time to do the damage
        // this.order = Order.create(
        //     this.decisionLeg[0].direction > 0 ? Order.Buy : Order.Sell,
        //     tick.symbol,
        //     25,
        //     tick.price,
        //     0,
        //     0
        // )
        // this.events.emit('openOrder', { tsHr: tick.tsHr, order: this.order })
        this.#cycle('good')
    }
}

module.exports = NewWave
