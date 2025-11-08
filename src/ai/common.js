const path = require('path')
const Symbol = require('../core/Symbol')
const BinanceRawReader = require('../sources/BinanceRawReader')
const NN = require('../ai/nn')
const CandlesMap = require('../ai/CandlesMap')
const MakeFlat = require('../ai/MakeFlat')
const TradeKind = require('../core/TradeKind')
const Candle = require('../core/Candle')
const Macd = require('../instruments/macd')
const { postProcessPrediction } = require('./postProcessPrediction')

const _createPyNn = async (config) => {
    const pythonFolder = path.resolve(__dirname, '..', '..', 'python')
    const scriptPath = path.resolve(pythonFolder, 'nn.sh')
    const { spawn } = require('child_process')
    const py = spawn(scriptPath, [config.modelName], { stdio: ['pipe', 'pipe', 'inherit'] })

    const sendCmd = async (cmd, params) => {
        const sendPart = async (part) => {
            return new Promise((resolve, reject) => {
                py.stdin.write(part, (err) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        }
        await sendPart(Buffer.from(cmd + '\n'))
        if (params) {
            if (!Buffer.isBuffer(params)) throw new Error('Params must be a Buffer')
            await sendPart(params)
        }
        return new Promise((resolve, reject) => {
            py.stdout.once('data', (data) => {
                try {
                    resolve(data.toString())
                } catch (err) {
                    reject(err)
                }
            })
        })
    }

    if (JSON.parse(await sendCmd('ping')) !== 'pong') {
        throw new Error('Python NN process is not responding correctly')
    }

    py.relativeSavePath = 'pyt'
    py.train = async (samples) => {
        const result = {
            history: {
                loss: [0],
                mae: [0],
                mse: [0]
            }
        }
        for (const sample of samples) {
            const flat = MakeFlat(sample.inputs, sample.output.direction)
            const buffer = Buffer.alloc(flat.length * 8)
            const floatView = new Float64Array(buffer.buffer, buffer.byteOffset, flat.length)
            floatView.set(flat)
            const obj = JSON.parse(await sendCmd('train', buffer))
            result.history.loss[0] = obj.loss[0]
            result.history.mae[0] = obj.metrics.mae
            result.history.mse[0] = obj.metrics.mse
        }
        return result
    }

    py.save = async () => {
        if (JSON.parse(await sendCmd('save')) !== 'saved') {
            throw new Error('Python NN process did not acknowledge save command')
        }
    }

    py.pred = async (sample) => {
        const flat = MakeFlat(sample.inputs)
        const buffer = Buffer.alloc(flat.length * 8)
        const floatView = new Float64Array(buffer.buffer, buffer.byteOffset, flat.length)
        floatView.set(flat)
        const obj = JSON.parse(await sendCmd('pred', buffer))
        return postProcessPrediction(obj.computed[0], obj.computed[1])
    }

    return py
}
const _createTfNn = async (config) => {
    return await NN.create({
        modelName: config.modelName,
        epochs: 1,
        inputsCount: config.inputsCount
    })
}

const _simulateTrades = async (startTradingIndex, config, pastSimulationsTimeouts) => {
    const maxHoldingTimeUs = config.maxHoldingTimeMin * 60 * 1000000
    const firstTrade = await config.brr.readTrade(startTradingIndex)
    const buyOrder = {
        kind: TradeKind.buy,
        enter: null,
        lastProfitPercent: null,
        profitPercent: null,
        durationUs: -1,
        forceClose: false,
        tradesCount: 0

    }
    const sellOrder = {
        kind: TradeKind.sell,
        enter: null,
        lastProfitPercent: null,
        profitPercent: null,
        durationUs: -1,
        forceClose: false,
        tradesCount: 0
    }

    /**
     * Process an order to evolve its internal state.
     * @param {{kind: {TradeKind}, enter: {number}, profitPercent: {number}}} order
     */
    const process = (order, currentPrice, currentDurationUs, forceClose) => {
        if (order.enter === null) {
            order.enter = currentPrice
        }
        order.durationUs = currentDurationUs
        order.forceClose = forceClose
        order.tradesCount++
        const profit = order.kind === TradeKind.buy
            ? currentPrice - order.enter
            : order.enter - currentPrice
        order.lastProfitPercent = profit / order.enter
        if ((order.lastProfitPercent >= config.profitTargetPercent) ||
            (order.lastProfitPercent <= -1 * config.stopLossPercent) ||
            forceClose
        ) {
            order.profitPercent = order.lastProfitPercent
        }
    }
    const inspectedTrades = []
    for (let i = startTradingIndex; i < config.brr.info.recordsCount; i++) {
        if ((buyOrder.profitPercent !== null) && (sellOrder.profitPercent !== null)) break
        const trade = await config.brr.readTrade(i)
        inspectedTrades.push(trade)
        const currentDurationUs = trade.tsUs - firstTrade.tsUs
        const forceClose = currentDurationUs >= maxHoldingTimeUs
        switch (trade.kind) {
            case TradeKind.buy:{
                process(buyOrder, trade.price, currentDurationUs, forceClose)
                break
            }
            case TradeKind.sell:
                process(sellOrder, trade.price, currentDurationUs, forceClose)
                break
            default:
                return null
        }
        if (forceClose) {
            if (pastSimulationsTimeouts.limit === 0) {
                break
            } else {
                pastSimulationsTimeouts.count++
                if (pastSimulationsTimeouts.count >= pastSimulationsTimeouts.limit) {
                    return null
                } else {
                    break
                }
            }
        }
    }

    if (pastSimulationsTimeouts.limit !== 0) {
        if (buyOrder.profitPercent !== null && sellOrder.profitPercent !== null) { pastSimulationsTimeouts.count = 0 }
    }

    const closeOrder = (order) => {
        if (order.profitPercent !== null) return
        if (order.lastProfitPercent !== null) {
            order.profitPercent = order.lastProfitPercent
            order.forceClose = true
        }
    }

    closeOrder(buyOrder)
    closeOrder(sellOrder)

    // Skip samples with null outcomes to prevent training issues
    if (buyOrder.profitPercent === null || sellOrder.profitPercent === null) {
        console.log('Skipping sample due to null outcomes')
        return null // Signal to skip this sample
    }

    const direction = (() => {
        if (buyOrder.profitPercent > 0) {
            if (sellOrder.profitPercent > 0) {
                const value = Math.max(buyOrder.profitPercent, sellOrder.profitPercent)
                const sign = buyOrder.profitPercent >= sellOrder.profitPercent ? 1 : -1
                return Math.min(value / config.profitTargetPercent) * sign
            } else {
                return Math.min(buyOrder.profitPercent / config.profitTargetPercent, 1)
            }
        } else {
            if (sellOrder.profitPercent > 0) {
                return Math.min(sellOrder.profitPercent / config.profitTargetPercent, 1) * -1
            } else {
                return 0
            }
        }
    })()

    return { buyOrder, sellOrder, direction }
}

const _loadCandles = async (config, firstCandleIndex) => {
    const candlesPreambleCount = 100
    const requiredCandlesCount = config.candlesPerWindow + candlesPreambleCount
    if (firstCandleIndex < 0) {
        firstCandleIndex = Math.floor(Math.random() * (config.candlesMap.length - requiredCandlesCount))
    }
    const result = config.candlesMap.bulkGet(
        config.brr,
        firstCandleIndex,
        requiredCandlesCount
    )

    result.nextTradeIndex = result.firstCandleIndex + result.tradesCount

    return result
}

const _checkCandleContinuity = (candles) => {
    for (let i = 1; i < candles.length; i++) {
        if ((candles[i].id - candles[i - 1].id) !== 1) {
            return false
        }
    }
    return true
}

const _createTrainingSample = async (candles, startTradingIndex, config, pastSimulationsTimeouts) => {
    // simulate the trades
    const simulation = await _simulateTrades(startTradingIndex, config, pastSimulationsTimeouts)
    if (!simulation) {
        return null
    }
    const { buyOrder, sellOrder, direction } = simulation

    // normalize the candles
    Candle.normalize(candles, config.normalizeAroundZero ?? false, config.normalizationFactor ?? 1)

    // Extract the training candles
    const trainingCandles = candles.slice(-1 * config.candlesPerWindow)

    // signals computations
    const macdComputer = new Macd()
    const macd = []
    const start = candles.length - config.candlesPerWindow
    candles.forEach((candle, index) => {
        macdComputer.push(candle.close.normalizedPrice)
        if (index >= start && index < start + config.candlesPerWindow) {
            macd.push(macdComputer.value)
        }
    })

    // Calculate direction signal: positive for buy, negative for sell
    return {
        inputs: {
            candles: {
                opens: trainingCandles.map(c => c.open.normalizedPrice),
                highs: trainingCandles.map(c => c.high.normalizedPrice),
                lows: trainingCandles.map(c => c.low.normalizedPrice),
                closes: trainingCandles.map(c => c.close.normalizedPrice),
                volumes: trainingCandles.map(c => c.normalizedQuoteVolume),
                timestamps: trainingCandles.map(c => c.normalizedMinuteOfDay),
                colors: trainingCandles.map(c => c.direction),
                bodySizes: trainingCandles.map(c => c.normalizedHeight),
                tradesCount: trainingCandles.map(c => c.normalizedTradesCount)
            },
            studies: {
                macdShort: macd.map(m => m.short),
                macdLong: macd.map(m => m.long),
                macdLine: macd.map(m => m.macd),
                macdSignal: macd.map(m => m.signal),
                macdHistogram: macd.map(m => m.histogram)
            },
            global: {
                candleDuration: trainingCandles[0].periodUs / 60000000,
                windowSize: config.candlesPerWindow,
                profitTargetPercent: config.profitTargetPercent,
                stopLossPercent: config.stopLossPercent,
                positionSize: config.positionSize,
                fees: config.feesPercent
            }
        },
        output: {
            direction,
            buyProfit: buyOrder.profitPercent,
            sellProfit: sellOrder.profitPercent
        },
        buyOrder,
        sellOrder
    }
}

module.exports = {
    getConfig: async (modelName) => {
        const modelRootPath = path.resolve(__dirname, '..', '..', 'models', modelName)
        const result = require(path.resolve(modelRootPath, 'config.json'))
        result.modelRootPath = modelRootPath
        result.symbol = Symbol.find(result.symbol)
        result.modelName = modelName
        const baseFolder = path.resolve(__dirname, '..', '..', 'data')
        result.tradesBinaryFilePath = path.resolve(baseFolder, `${result.exchangeName}_${result.symbol.id}_trades.bin`)
        result.brr = BinanceRawReader.create(result.tradesBinaryFilePath, result.symbol)
        result.availableDataRange = result.brr.info
        result.availableDataRange.durationUs = result.availableDataRange.endTimestampUs - result.availableDataRange.startTimestampUs
        result.candlesMap = await CandlesMap.create(result)

        while (true) {
            const candlesInfo = await _loadCandles(result, -1)
            if (!_checkCandleContinuity(candlesInfo.candles)) { continue }
            const sample = await _createTrainingSample(candlesInfo.candles, candlesInfo.nextTradeIndex, result, { limit: 0 })
            if (sample === null) { continue }
            result.inputsCount = MakeFlat(sample.inputs).length
            break
        }
        return result
    },
    createNn: async (config) => {
        const result = config.usePython
            ? await _createPyNn(config)
            : await _createTfNn(config)
        config.learnLogPath = path.resolve(config.modelRootPath, result.relativeSavePath, 'learn.log')
        config.predLogPath = path.resolve(config.modelRootPath, result.relativeSavePath, 'pred.log')
        return result
    },
    loadCandles: _loadCandles,
    checkCandleContinuity: _checkCandleContinuity,
    simulateTrades: _simulateTrades,
    createTrainingSample: _createTrainingSample
}
