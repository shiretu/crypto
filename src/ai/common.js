const path = require('path')
const Symbol = require('../core/Symbol')
const BinanceRawReader = require('../sources/BinanceRawReader')
const NN = require('../ai/nn')
const CandlesMap = require('../ai/CandlesMap')
const MakeFlat = require('../ai/MakeFlat')
const TradeKind = require('../core/TradeKind')

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
            const flat = MakeFlat(sample)
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
    return py
}
const _createTfNn = async (config) => {
    return await NN.create({
        modelName: config.modelName,
        epochs: 1
    })
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
        return result
    },
    createNn: async (config) => {
        const result = config.usePython
            ? await _createPyNn(config)
            : await _createTfNn(config)
        config.learnLogPath = path.resolve(config.modelRootPath, result.relativeSavePath, 'learn.log')
        return result
    },
    checkCandleContinuity: (candles) => {
        for (let i = 1; i < candles.length; i++) {
            if ((candles[i].id - candles[i - 1].id) !== 1) {
                return false
            }
        }
        return true
    },
    simulateTrades: async (startTradingIndex, config, pastSimulationsTimeouts) => {
        const maxHoldingTimeUs = (config.maxHoldingTimeMin || 120) * 60 * 1000000
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

        const operation = (() => {
            if (buyOrder.profitPercent > 0) {
                if (sellOrder.profitPercent > 0) {
                    return buyOrder.profitPercent >= sellOrder.profitPercent ? 1 : -1
                } else {
                    return 1
                }
            } else {
                if (sellOrder.profitPercent > 0) {
                    return -1
                } else {
                    return 0
                }
            }
        })()

        return { buyOrder, sellOrder, operation }
    }
}
