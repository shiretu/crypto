const Candle = require('../../core/Candle')
const Order = require('../../core/Order')
const TradeKind = require('../../core/TradeKind')
const Macd = require('../../instruments/macd')
const { cache } = require('./Cache')
const { Output } = require('./Output')

class Sample {
    #rawAll /** @type {Float64Array} */
    #rawInputs /** @type {number[]} */
    #rawOutputs /** @type {number[]} */

    static async compute (config, startCandleIndex) {
        const sample = new Sample()
        await sample.#init(config, startCandleIndex)
        return sample
    }

    static load (rawAll, inputsGlobalLength) {
        const sample = new Sample()
        sample.#rawAll = rawAll
        sample.#rawInputs = sample.#rawAll.subarray(0, inputsGlobalLength)
        sample.#rawOutputs = sample.#rawAll.subarray(inputsGlobalLength)
        return sample
    }

    async #init (config, startCandleIndex) {
        const payload = await this.#prepareInputs(config, startCandleIndex)
        await this.#prepareOutputs(config, payload)
        const inputs = payload.inputs.flat()
        this.#rawAll = Float64Array.from([...inputs, ...payload.outputs.flatMap(order => [
            order.kind,
            order.isClosed ? 1 : 0,
            order.isStopLossHit ? 1 : 0,
            order.profit,
            order.enterPrice,
            order.ageUs,
            order.maxAgeUs,
            order.profitPercent,
            order.confidence
        ])])
        this.#rawInputs = this.#rawAll.subarray(0, inputs.length)
        this.#rawOutputs = this.#rawAll.subarray(inputs.length)
    }

    get rawAll () { return this.#rawAll }
    get rawInputs () { return this.#rawInputs }
    get rawOutputs () { return this.#rawOutputs }
    get outputs () { return [Output.createFromRaw(this.#rawOutputs.subarray(0, this.#rawOutputs.length / 2)), Output.createFromRaw(this.#rawOutputs.subarray(this.#rawOutputs.length / 2))] }

    /**
     * Get the signal category based on confidence values
     * Returns an integer 0-5 representing:
     * 0: BUY_STRONG (buy confidence > 0.5)
     * 1: BUY_FAILED (buy confidence < -0.5)
     * 2: BUY_WEAK (buy confidence -0.5 to 0.5)
     * 3: SELL_STRONG (sell confidence > 0.5)
     * 4: SELL_FAILED (sell confidence < -0.5)
     * 5: SELL_WEAK (sell confidence -0.5 to 0.5)
     * @returns {number} Signal category index (0-5)
     */
    get signalCategory () {
        const buyConfidence = this.outputs[0].confidence
        const sellConfidence = this.outputs[1].confidence

        // Classify buy signal strength
        let buyClass
        if (buyConfidence > 0.5) {
            buyClass = 0 // BUY_STRONG
        } else if (buyConfidence < -0.5) {
            buyClass = 1 // BUY_FAILED
        } else {
            buyClass = 2 // BUY_WEAK
        }

        // Classify sell signal strength
        let sellClass
        if (sellConfidence > 0.5) {
            sellClass = 3 // SELL_STRONG
        } else if (sellConfidence < -0.5) {
            sellClass = 4 // SELL_FAILED
        } else {
            sellClass = 5 // SELL_WEAK
        }

        // Pick the class with stronger absolute confidence
        return Math.abs(buyConfidence) >= Math.abs(sellConfidence) ? buyClass : sellClass
    }

    async #prepareInputs (config, startCandleIndex) {
        const candles = await cache.candles(config)
        const requiredCandlesCount = config.train.candlesWindowCount + config.train.candlesPreambleCount
        if ((startCandleIndex == null) || (startCandleIndex < 0)) {
            startCandleIndex = Math.floor(Math.random() * (candles.length - requiredCandlesCount))
        }

        const candlesInfo = await candles.readBulk(startCandleIndex, requiredCandlesCount)

        // normalize the candles
        Candle.normalize(candlesInfo.candles, config.train.normalizeAroundZero, config.train.normalizationFactor)

        // Extract the training candles
        const trainingCandles = candlesInfo.candles.slice(-1 * config.train.candlesWindowCount)

        // signals computations
        const macdComputer = new Macd()
        const macd = []
        const start = candlesInfo.candles.length - config.train.candlesWindowCount
        candlesInfo.candles.forEach((candle, index) => {
            macdComputer.push(candle.close.normalizedPrice)
            if (index >= start && index < start + config.train.candlesWindowCount) {
                macd.push(macdComputer.value)
            }
        })

        return {
            inputs: trainingCandles.map((candle, index) => {
                return [
                    candle.open.normalizedPrice,
                    candle.high.normalizedPrice,
                    candle.low.normalizedPrice,
                    candle.close.normalizedPrice,
                    candle.normalizedQuoteVolume,
                    candle.normalizedMinuteOfDay,
                    candle.direction,
                    candle.normalizedHeight,
                    candle.normalizedTradesCount,
                    new Date(candle.tsUs.open / 1000).getDay(),
                    macd[index].short,
                    macd[index].long,
                    macd[index].macd,
                    macd[index].signal,
                    macd[index].histogram
                ]
            }),
            startTradeIndex: candlesInfo.nextTradeIndex,
            firstCandleIndex: candlesInfo.firstCandleIndex
        }
    }

    async #prepareOutputs (config, payload) {
        const trades = await cache.trades(config)
        const maxDurationUs = config.trade.maxDurationSec * 1000000
        const firstTrade = await trades.read(payload.startTradeIndex)
        const buyOrder = Order.create(TradeKind.buy, config.trade.slPercent, config.trade.tpPercent)
        const sellOrder = Order.create(TradeKind.sell, config.trade.slPercent, config.trade.tpPercent)

        let lastGoodTradeTsUs = firstTrade.tsUs + maxDurationUs
        for (let i = payload.startTradeIndex; i < trades.length; i++) {
            const trade = await trades.read(i)
            if ((trade.tsUs - firstTrade.tsUs) >= maxDurationUs) break
            lastGoodTradeTsUs = trade.tsUs
            buyOrder.pushTrade(trade)
            sellOrder.pushTrade(trade)
            if (buyOrder.isClosed && sellOrder.isClosed) break
        }

        const process = (order) => {
            // Handle orders that never got entered
            if (!order.enter || !order.last) return 0

            // Calculate confidence based on how quickly the order closed/reached current time
            const timeRatio = order.isClosed
                ? (order.ageUs / maxDurationUs)
                : ((lastGoodTradeTsUs - firstTrade.tsUs) / maxDurationUs)
            const confidence = Math.floor((1 - timeRatio) * 1000) / 1000

            // Determine direction based on outcome
            const direction = (() => {
            // Closed orders: use whether stop-loss or take-profit was hit
                if (order.isClosed) { return order.isStopLossHit ? -1 : 1 }

                // Open orders: use the sign of unrealized profit
                return order.profitPercent >= 0 ? 1 : -1
            })()

            order.confidence = confidence * direction
        }

        process(buyOrder)
        process(sellOrder)

        payload.outputs = [buyOrder, sellOrder].map(order => ({
            kind: order.kind,
            isClosed: order.isClosed,
            isStopLossHit: order.isStopLossHit,
            profit: order.profit,
            enterPrice: order.enter ? order.enter.price : null,
            ageUs: order.ageUs,
            maxAgeUs: config.trade.maxDurationSec * 1000000,
            profitPercent: order.profitPercent,
            confidence: order.confidence
        }))

        return payload
    }
}

module.exports = Sample
