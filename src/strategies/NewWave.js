const console = require('../utils/coloredConsole')
const path = require('path')
const { generatePng } = require('../utils/utils')
const { generateAndSavePng } = require('../utils/CandlesPrinter')

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
        // on a grey candle, we give up; they do not happen too often anyways. This simplifies things
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

    #cycle (reason) {
        const imagePath = path.resolve(path.join(__dirname, '..', '..', 'trades', this.initLeg[0].open.symbol.name()), reason, `${this.initLeg[0].tsHr}.png`)
        generateAndSavePng(imagePath, [...this.initLeg.map(c => c.info), ...this.signalLeg.map(c => c.info), ...this.decisionLeg.map(c => c.info)])
        this.initLeg = this.signalLeg
        this.signalLeg = this.decisionLeg
        this.decisionLeg = []
    }

    #makeDecision (tick) {
        console.log(`${this.initLeg[0].open.symbol.name()} ${this.initLeg[0].tsHr} ${this.signalLeg.at(-1).close.tsHr} ${this.initLeg.length} ${this.signalLeg.length} ${this.decisionLeg.length}`)

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

        this.#cycle('good')
    }
}

module.exports = NewWave

//  ETHUSDC 2025-10-16 21:11:01.252353 3852.503 --> 3852.017
//  ETHUSDC 2025-10-16 21:21:00.968035 3863.060 --> 3863.627
