const Candle = require('../../core/Candle')
const { EventEmitter } = require('events')
const Symbol = require('../../core/Symbol')
const EventName = require('../../core/EventName')

class NewWave {
    #events /** @type {EventEmitter} */
    #exchangeName /** @type {string} */
    #symbol /** @type {Symbol} */
    #leg1 /** @type {Candle[]} */
    #leg2 /** @type {Candle[]} */
    #leg3 /** @type {Candle[]} */

    /** @param {EventEmitter} events */
    /** @param {string} exchangeName */
    /** @param {Symbol} symbol */
    constructor (events, exchangeName, symbol) {
        this.#events = events
        this.#exchangeName = exchangeName
        this.#symbol = symbol
        this.#events.on(
            EventName.ofCandle(EventName.ACTION.CLOSED, this.#exchangeName, this.#symbol.id),
            (candle) => { this.#onCandleClosed(candle) }
        )
        this.#leg1 = []
        this.#leg2 = []
        this.#leg3 = []
    }

    #reset (reason) {
        this.#leg1 = []
        this.#leg2 = []
        this.#leg3 = []
    }

    #cycle (reason) {
        // const p = new Printer()
        // p.addCandles([...this.initLeg, ...this.signalLeg, ...this.decisionLeg])
        // p.print(path.resolve(path.join(__dirname, '..', '..', 'trades', this.initLeg[0].open.symbol.name()), reason, `${this.initLeg[0].tsHr}.png`), this.initLeg[0].symbolName)
        // const imagePath = path.resolve(path.join(__dirname, '..', '..', 'trades', this.initLeg[0].open.symbol.name()), reason, `${this.initLeg[0].tsHr}.png`)
        // generateAndSavePng(imagePath, [...this.initLeg.map(c => c.info), ...this.signalLeg.map(c => c.info), ...this.decisionLeg.map(c => c.info)])
        this.#leg1 = this.#leg2
        this.#leg2 = this.#leg3
        this.#leg3 = []
    }

    /**
     * @param {Candle} candle
     */
    #onCandleClosed (candle) {
        // on a grey candle, we give up; they do not happen too often anyways. This simplifies things
        if (candle.direction === 0) {
            this.#reset('Grey candle')
            return
        }

        // start the first leg when empty
        if (this.#leg1.length === 0) {
            this.#leg1 = [candle]
            return
        }

        // contribute to first leg or start the signal leg
        if (this.#leg2.length === 0) {
            if (this.#leg1[0].direction === candle.direction) {
                this.#leg1.push(candle)
            } else {
                this.#leg2 = [candle]
            }
            return
        }

        // continue to push to signal leg
        if (this.#leg2[0].direction === candle.direction) {
            this.#leg2.push(candle)
            return
        }

        // decision leg started
        this.#leg3.push(candle)

        // make the decision
        this.#makeDecision()
    }

    #makeDecision (reason) {
        // check leg 1
        if (this.#leg1.length < 2) {
            this.#cycle('not enough candles in leg 1')
            return
        }
        if (this.#leg1.length > 3) {
            this.#cycle('too many candles in leg 1')
            return
        }
        for (let i = 1; i < this.#leg1.length; i++) {
            if (this.#leg1[i].volumes.quote <= this.#leg1[i - 1].volumes.quote) {
                this.#cycle('leg 1 volumes not increasing')
                return
            }
        }

        // check leg 2
        /*
        1/φ ≈ 0.618 (61.8%),
        1 − 1/φ ≈ 0.382 (38.2%).
        */
        const ratio = 0.382
        const leg1Height = this.#leg1.at(-1).prices.close - this.#leg1[0].prices.open
        const leg2DipLimit = this.#leg1.at(-1).prices.close - (leg1Height * ratio)
        if (this.#leg2.length > 2) {
            this.#cycle('too many candles in leg 2')
            return
        }
        if (this.#leg1.at(-1).volumes.quote <= this.#leg2[0].volumes.quote) {
            this.#cycle('leg 1 quote volume not greater than leg 2')
            return
        }
        for (let i = 0; i < this.#leg2.length; i++) {
            if (this.#leg2[i].prices.close < leg2DipLimit) {
                this.#cycle('leg 2 dip too deep')
                return
            }
            if (i === 0) continue
            if (this.#leg2[i - 1].volumes.quote >= this.#leg2[i].volumes.quote) {
                this.#cycle('leg 2 volumes not decreasing')
                return
            }
        }

        // check leg 3
        this.#cycle('not yet implemented')
    }
}

module.exports = {
    getStrategy: (events, exchangeName, symbol) => {
        return new NewWave(events, exchangeName, symbol)
    }
}
