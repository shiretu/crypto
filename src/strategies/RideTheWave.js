class RideTheWave {
    static SETUP = {
        firstIncreaseCandlesCount: 3,
        allowDipLimitRatio: 2n,
        dipCountLimit: 3,
        leverage: 110n,
        quoteQty: 2500000000n,
        timeLimit: 3600 * 1000000
    }

    constructor (events) {
        this.events = events
        this.events.on('candleOpen', (evt) => this.#onCandleOpen(evt))
        this.events.on('candleUpdate', (evt) => this.#onCandleUpdate(evt))
        this.events.on('candleClose', (evt) => this.#onCandleClose(evt))
        this.events.on('orderClosed', (evt) => { this.enabled = true })
        this.candlesFirstIncrease = []
        this.candlesDip = []
        this.candlesSecondIncrease = []
        this.enabled = true
    }

    #reset () {
        this.candlesFirstIncrease = []
        this.candlesDip = []
        this.candlesSecondIncrease = []
    }

    #onCandleClose (evt) {
        if (!this.enabled) return
        // dispatch
        if (evt.candle.direction > 0) { return this.#onCandleCloseGreen(evt) }
        if (evt.candle.direction === 0) { return this.#onCandleCloseZero(evt) }
        if (evt.candle.direction < 0) { return this.#onCandleCloseRed(evt) }
    }

    #onCandleCloseGreen (evt) {
        if (this.candlesFirstIncrease.length === 0) {
            this.candlesFirstIncrease.push(evt.candle.clone())
            return
        }
        if (this.candlesDip.length === 0) {
            this.candlesFirstIncrease.push(evt.candle.clone())
        } else {
            this.candlesSecondIncrease.push(evt.candle.clone())
        }
    }

    #onCandleCloseZero (evt) {
        if (this.candlesFirstIncrease.length === 0) { return }
        if (this.candlesDip.length === 0) {
            this.candlesFirstIncrease.push(evt.candle.clone())
            return
        }
        if (this.candlesSecondIncrease.length === 0) {
            if (this.candlesDip.length >= RideTheWave.SETUP.dipCountLimit) {
                this.#reset()
                return
            }
            this.candlesDip.push(evt.candle.clone())
            return
        }
        this.candlesSecondIncrease.push(evt.candle.clone())
    }

    #onCandleCloseRed (evt) {
        // if we get the red too soon, we bail out
        if (this.candlesFirstIncrease.length < RideTheWave.SETUP.firstIncreaseCandlesCount) {
            this.#reset()
            return
        }

        // see if we dip too much
        const totalHeight = this.candlesFirstIncrease.at(-1).close.price - this.candlesFirstIncrease[0].open.price
        const dipLimit = this.candlesFirstIncrease[0].open.price + totalHeight / RideTheWave.SETUP.allowDipLimitRatio
        if (evt.candle.close.price <= dipLimit) {
            this.#reset()
            return
        }

        // is this the first dip? if so, we store it and we are done
        if (this.candlesDip.length === 0) {
            this.candlesDip.push(evt.candle.clone())
            return
        }

        // did we already started to add to second increase?
        if (this.candlesSecondIncrease.length !== 0) {
            this.#reset()
            return
        }

        // do we have more then 3 dips?
        if (this.candlesDip.length >= RideTheWave.SETUP.dipCountLimit) {
            this.#reset()
            return
        }

        // add it
        this.candlesDip.push(evt.candle.clone())
    }

    #onCandleOpen (evt) {
        if (!this.enabled) return
        // dispatch
        this.#onCandleUpdate(evt)
    }

    #onCandleUpdate (evt) {
        if (!this.enabled) return
        // dispatch
        if (evt.candle.direction > 0) { return this.#onCandleUpdateGreen(evt) }
        if (evt.candle.direction === 0) { return this.#onCandleUpdateZero(evt) }
        if (evt.candle.direction < 0) { return this.#onCandleUpdateRed(evt) }
    }

    #onCandleUpdateGreen (evt) {
        // did we get the dip?
        if (this.candlesDip.length === 0) { return }

        // are we below or equal last high?
        const buyAt = this.candlesDip.map(candle => candle.high.price).sort()[0]
        if (buyAt >= evt.tick.price) { return }

        // establish the protection sell
        const sellAtLow = this.candlesDip.map(candle => candle.low.price).sort().at(0)
        const sellAtHigh = buyAt + (buyAt - sellAtLow) * RideTheWave.SETUP.leverage / 100n

        // trigger the buy
        this.events.emit('orderOpen', {
            trade: {
                type: 'buy',
                at: buyAt,
                low: sellAtLow,
                high: sellAtHigh,
                quoteQty: RideTheWave.SETUP.quoteQty,
                timeLimit: RideTheWave.SETUP.timeLimit
            },
            metadata: {
                tick: evt.tick,
                firstIncrease: this.candlesFirstIncrease,
                dip: this.candlesDip,
                secondIncrease: this.secondIncrease
            }
        })
        this.#reset()
        this.enabled = false
    }

    #onCandleUpdateZero (evt) {}

    #onCandleUpdateRed (evt) {
        if (this.candlesSecondIncrease.length !== 0) {
            this.#reset()
        }
    }
}
module.exports = RideTheWave
