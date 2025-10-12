class RideTheWave {
    static SETUP = {
        pattern: {
            firstIncreaseCandlesCount: 3,
            allowDipLimit: 0.7,
            dipCountLimit: 3
        },
        order: {
            transactionFeesPercent: 0.001, // 0.10%
            gainsPercent: 0.002,
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
        this.candlesFirstIncrease = []
        this.candlesDip = []
        this.candlesSecondIncrease = []
        this.enabled = true
    }

    #reset (reason) {
        if (!reason) { throw new Error('No reason given') }
        // console.log(reason)
        this.candlesFirstIncrease = []
        this.candlesDip = []
        this.candlesSecondIncrease = []
    }

    #onCandleClose (evt) {
        // dispatch
        if (!this.enabled) return
        if (evt.candle.info.direction > 0) { return this.#onCandleCloseGreen(evt) }
        if (evt.candle.info.direction === 0) { return this.#onCandleCloseZero(evt) }
        if (evt.candle.info.direction < 0) { return this.#onCandleCloseRed(evt) }
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
            if (this.candlesDip.length >= RideTheWave.SETUP.pattern.dipCountLimit) {
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
        if (this.candlesFirstIncrease.length < RideTheWave.SETUP.pattern.firstIncreaseCandlesCount) {
            this.#reset('First increase is not having enough green candles')
            return
        }

        // see if we dip too much
        const totalHeight = this.candlesFirstIncrease.at(-1).close.price - this.candlesFirstIncrease[0].open.price
        const dipLimit = this.candlesFirstIncrease[0].open.price + totalHeight * RideTheWave.SETUP.pattern.allowDipLimit
        if (evt.candle.close.price <= dipLimit) {
            this.#reset('The dip went too far')
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
        if (this.candlesDip.length >= RideTheWave.SETUP.pattern.dipCountLimit) {
            this.#reset('We have too many dips')
            return
        }

        // add it
        this.candlesDip.push(evt.candle.clone())
    }

    #onCandleOpen (evt) {
        // dispatch
        if (!this.enabled) return
        this.#onCandleUpdate(evt)
    }

    #onCandleUpdate (evt) {
        // dispatch
        if (!this.enabled) return
        if (evt.candle.info.direction > 0) { return this.#onCandleUpdateGreen(evt) }
        if (evt.candle.info.direction === 0) { return this.#onCandleUpdateZero(evt) }
        if (evt.candle.info.direction < 0) { return this.#onCandleUpdateRed(evt) }
    }

    #onCandleUpdateGreen (evt) {
        // did we get the dip?
        if (this.candlesDip.length === 0) { return }

        // are we below or equal last high?
        const buyAt = this.candlesDip.map(candle => candle.high.price).sort()[0]
        if (buyAt >= evt.tick.price) { return }

        // establish the protection sell
        const sellAtLow = this.candlesDip.map(candle => candle.low.price).sort().at(0)
        const sellAtHigh = buyAt * (1 + RideTheWave.SETUP.order.transactionFeesPercent) * (1 + RideTheWave.SETUP.order.gainsPercent) / (1 - RideTheWave.SETUP.order.transactionFeesPercent)
        // console.log(((sellAtHigh - buyAt) / buyAt * 100).toFixed(2))

        // trigger the buy
        this.events.emit('orderOpen', {
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
                firstIncrease: this.candlesFirstIncrease,
                dip: this.candlesDip,
                secondIncrease: this.secondIncrease
            }
        })
        this.#reset('Order opened')
        this.enabled = false
    }

    #onCandleUpdateZero (evt) {}

    #onCandleUpdateRed (evt) {
        if (this.candlesSecondIncrease.length !== 0) {
            this.#reset('We have received a red candle on the second increase')
        }
    }
}
module.exports = RideTheWave
