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
            if (this.#leg1.at(-1).direction === candle.direction) {
                this.#leg1.push(candle)
            } else {
                this.#leg2 = [candle]
            }
            return
        }

        // continue to push to signal leg
        if (this.#leg1.at(-1).direction === candle.direction) {
            this.#leg1.push(candle)
            return
        }

        // decision leg started
        this.#leg3.push(candle)

        // make the decision
        this.#makeDecision()
    }

    #makeDecision (reason) {
        this.#cycle('not yet implemented')
    }
}

module.exports = {
    getStrategy: (events, exchangeName, symbol) => {
        return new NewWave(events, exchangeName, symbol)
    }
}
