class RideTheWave {
    static SETUP = {
        pattern: {
            firstIncreaseCandlesCount: 3,
            decreasePercentLimit: 0.7,
            decreaseCountLimit: 3,
            greenTransactionsCount: 200
        },
        order: {
            transactionFeesPercent: 0.001, // 0.10%
            gainsPercent: 0.001,
            investedQuoteQty: 25,
            timeLimit: 3600 * 1000000 // 1H
        }
    }

    constructor (events) {
        this.events = events
        this.events.on('candleOpen', (evt) => this.#onCandleOpen(evt))
        this.events.on('candleUpdate', (evt) => this.#onCandleUpdate(evt))
        this.events.on('candleClose', (evt) => this.#onCandleClose(evt))
        this.events.on('orderClosed', (evt) => { this.enabled = true })
        this.firstIncrease = []
        this.decrease = []
        this.secondIncrease = []
        this.enabled = true
    }

    #reset (reason) {
        if (!reason) { throw new Error('No reason given') }
        // console.log(reason)
        this.firstIncrease = []
        this.decrease = []
        this.secondIncrease = []
    }

    #onCandleClose (evt) {
        // dispatch
        if (!this.enabled) return
        if (evt.candle.direction > 0) { return this.#onCandleCloseGreen(evt) }
        if (evt.candle.direction === 0) { return this.#onCandleCloseZero(evt) }
        if (evt.candle.direction < 0) { return this.#onCandleCloseRed(evt) }
    }

    #onCandleCloseGreen (evt) {
        if (evt.candle.tradesCount < RideTheWave.SETUP.pattern.greenTransactionsCount) {
            this.#reset('Green candle almost yellow: too few trades')
            return
        }
        if (this.firstIncrease.length === 0) {
            this.firstIncrease.push(evt.candle.clone())
            return
        }
        if (this.decrease.length === 0) {
            this.firstIncrease.push(evt.candle.clone())
        } else {
            this.secondIncrease.push(evt.candle.clone())
        }
    }

    #onCandleCloseZero (evt) {
        if (this.firstIncrease.length === 0) { return }
        if (this.decrease.length === 0) {
            this.firstIncrease.push(evt.candle.clone())
            return
        }
        if (this.secondIncrease.length === 0) {
            if (this.decrease.length >= RideTheWave.SETUP.pattern.decreaseCountLimit) {
                this.#reset()
                return
            }
            this.decrease.push(evt.candle.clone())
            return
        }
        this.secondIncrease.push(evt.candle.clone())
    }

    #onCandleCloseRed (evt) {
        // if we get the red too soon, we bail out
        if (this.firstIncrease.length < RideTheWave.SETUP.pattern.firstIncreaseCandlesCount) {
            this.#reset('First increase is not having enough green candles')
            return
        }

        // see if we decreased too much
        const totalHeight = this.firstIncrease.at(-1).close.price - this.firstIncrease[0].open.price
        const decreaseLimit = this.firstIncrease[0].open.price + totalHeight * RideTheWave.SETUP.pattern.decreasePercentLimit
        if (evt.candle.close.price <= decreaseLimit) {
            this.#reset('The decrease went too far')
            return
        }

        // is this the first decrease? if so, we store it and we are done
        if (this.decrease.length === 0) {
            this.decrease.push(evt.candle.clone())
            return
        }

        // did we already started to add to second increase?
        if (this.secondIncrease.length !== 0) {
            this.#reset()
            return
        }

        // do we have too many decreases?
        if (this.decrease.length >= RideTheWave.SETUP.pattern.decreaseCountLimit) {
            this.#reset('We have too many decreases')
            return
        }

        // add it
        this.decrease.push(evt.candle.clone())
    }

    #onCandleOpen (evt) {
        // dispatch
        if (!this.enabled) return
        this.#onCandleUpdate(evt)
    }

    #onCandleUpdate (evt) {
        // dispatch
        if (!this.enabled) return
        if (evt.candle.direction > 0) { return this.#onCandleUpdateGreen(evt) }
        if (evt.candle.direction === 0) { return this.#onCandleUpdateZero(evt) }
        if (evt.candle.direction < 0) { return this.#onCandleUpdateRed(evt) }
    }

    #onCandleUpdateGreen (evt) {
        // did we get the decrease?
        if (this.decrease.length === 0) { return }

        // are we below or equal last high?
        const buyAt = this.decrease.map(candle => candle.high.price).sort((a, b) => b - a)[0]
        if (buyAt >= evt.tick.price) { return }

        // establish the protection sell
        const sellAtLow = this.decrease.map(candle => candle.low.price).sort().at(0)
        const sellAtHigh = buyAt * (1 + RideTheWave.SETUP.order.transactionFeesPercent) * (1 + RideTheWave.SETUP.order.gainsPercent) / (1 - RideTheWave.SETUP.order.transactionFeesPercent)
        // console.log(((sellAtHigh - buyAt) / buyAt * 100).toFixed(2))

        // trigger the buy
        const openEvt = {
            trade: {
                type: 'buy',
                at: buyAt,
                low: sellAtLow,
                high: sellAtHigh,
                quoteQty: RideTheWave.SETUP.order.investedQuoteQty,
                timeLimit: RideTheWave.SETUP.order.timeLimit
            },
            metadata: {
                tick: evt.tick,
                startTsHr: this.firstIncrease[0].open.tsHr,
                buyTsHr: evt.tick.tsHr,
                firstIncrease: this.firstIncrease,
                decrease: this.decrease,
                secondIncrease: this.secondIncrease
            }
        }
        this.events.emit('orderOpen', openEvt)
        this.#reset('Order opened')
        this.enabled = false
    }

    #onCandleUpdateZero (evt) {}

    #onCandleUpdateRed (evt) {
        if (this.secondIncrease.length !== 0) {
            this.#reset('We have received a red candle on the second increase')
        }
    }
}
module.exports = RideTheWave
