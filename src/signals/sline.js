const Candle = require('../core/Candle')
const { EventEmitter } = require('events')
const Symbol = require('../core/Symbol')
const EventName = require('../core/EventName')
const Printer = require('../utils/Printer')
const path = require('path')

class SLine {
    #events /** @type {EventEmitter} */
    #exchangeName /** @type {string} */
    #symbol /** @type {Symbol} */
    #eventName /** @type {string} */
    #name = 'sLine' /** @type {string} */
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
        this.#leg1 = []
        this.#leg2 = []
        this.#leg3 = []
        this.#eventName = EventName.ofSignal(this.#name, this.#exchangeName, this.#symbol.id)
        this.#events.on(
            EventName.ofCandle(EventName.ACTION.CLOSED, this.#exchangeName, this.#symbol.id),
            (candle) => { this.#onCandleClosed(candle) }
        )
    }

    /**
     * Returns the name of the strategy
     * @returns {string}
     */
    get name () {
        return this.#name
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

    #makeDecision () {
        const check = () => {
            // check leg 1
            if (this.#leg1.length < 2) { return 'not enough candles in leg 1' }
            if (this.#leg1.length > 3) { return 'too many candles in leg 1' }
            const leg1Green = (this.#leg1[0].direction === 1)
            for (let i = 1; i < this.#leg1.length; i++) {
                if (this.#leg1[i - 1].volumes.quote >= this.#leg1[i].volumes.quote) {
                    return 'leg 1 volumes not increasing'
                }
                if (leg1Green) {
                    if (this.#leg1[i - 1].prices.open >= this.#leg1[i].prices.open) {
                        return 'leg 1 open price not increasing'
                    }
                    if (this.#leg1[i - 1].prices.close >= this.#leg1[i].prices.close) {
                        return 'leg 1 close price not increasing'
                    }
                } else {
                    if (this.#leg1[i - 1].prices.open <= this.#leg1[i].prices.open) {
                        return 'leg 1 open price not decreasing'
                    }
                    if (this.#leg1[i - 1].prices.close <= this.#leg1[i].prices.close) {
                        return 'leg 1 close price not decreasing'
                    }
                }
            }

            // check leg 2
            if (this.#leg2.length > 2) {
                return 'too many candles in leg 2'
            }
            if (this.#leg1.at(-1).volumes.quote <= this.#leg2[0].volumes.quote) {
                return 'leg 1 quote volume not greater than leg 2'
            }

            const ratio = 0.382
            const leg1Height = leg1Green ? (this.#leg1.at(-1).prices.close - this.#leg1[0].prices.open) : (this.#leg1[0].prices.open - this.#leg1.at(-1).prices.close)
            const leg2BacktrackLimit = leg1Green ? (this.#leg1.at(-1).prices.close - (leg1Height * ratio)) : (this.#leg1.at(-1).prices.close + (leg1Height * ratio))

            for (let i = 0; i < this.#leg2.length; i++) {
                if (leg1Green) {
                    if (this.#leg2[i].prices.close < leg2BacktrackLimit) { return 'leg 2 dip too deep' }
                } else {
                    if (this.#leg2[i].prices.close > leg2BacktrackLimit) { return 'leg 2 jump too high' }
                }
                if (i === 0) continue
                if (this.#leg2[i - 1].volumes.quote <= this.#leg2[i].volumes.quote) { return 'leg 2 volumes not decreasing' }
            }

            // check leg 3: must be exactly one candle
            if (this.#leg3.length !== 1) { return 'invalid leg 3 length' }

            // leg3 must have bigger volume than every candle in leg2
            for (let i = 0; i < this.#leg2.length; i++) {
                if (this.#leg3[0].volumes.quote <= this.#leg2[i].volumes.quote) { return 'leg 3 volume not greater than leg 2' }
            }

            // all checks passed — return null (success)
            return null
        }

        // check if this is a valid signal
        const failReason = check()
        if (failReason !== null) {
            this.#cycle(failReason)
            return
        }

        // alright, it is. Emit the event
        this.#events.emit(this.#eventName, {
            leg1: this.#leg1,
            leg2: this.#leg2,
            leg3: this.#leg3
        })

        // cycle to the next event detection
        this.#cycle('good')
    }

    #save (reason) {
        const p = new Printer()
        p.addCandles([...this.#leg1, ...this.#leg2, ...this.#leg3])
        p.print(path.resolve(path.join(__dirname, '..', '..', '..', 'generatedImages', 'signals', this.#name, this.#symbol.id), reason, `${new Date(this.#leg1[0].tsUs.candle / 1000).toISOString()}.png`))
    }

    #reset () {
        this.#leg1 = []
        this.#leg2 = []
        this.#leg3 = []
    }

    #cycle (reason) {
        this.#save(reason)
        this.#leg1 = this.#leg2
        this.#leg2 = this.#leg3
        this.#leg3 = []
    }
}

module.exports = SLine
