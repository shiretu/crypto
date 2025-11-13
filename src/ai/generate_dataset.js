const { loadConfig, createInputs, createOutputs } = require('./common')
const Samples = require('./sampling/Samples')
const path = require('path')
const Symbol = require('../core/Symbol')
const Sample = require('./sampling/Sample')
const Trade = require('../core/Trade')
const paths = require('./sampling/paths')
const { cache } = require('./sampling/Cache')
const { progressBar } = require('./sampling/progressBar')
const fs = require('fs').promises

const work = async () => {
    // establish the samples count
    const sampleCount = parseInt(process.argv[2]) || 50000

    // Load config from any model (they share global_config.json)
    const config = await loadConfig('lstm')

    // create the UI progress bar
    const bar = progressBar(`Creating ${sampleCount} samples to ${config.pregeneratedSamplesDataPath}...`)
    bar.start(sampleCount, 0)

    // do the damage
    const all = []
    const alreadyProcessed = new Set()
    for (let i = 0; i < sampleCount; i++) {
        // create the inputs
        const inputsInfo = await createInputs(config)
        if (alreadyProcessed.has(inputsInfo.firstCandleIndex)) {
            i--
            continue
        }
        alreadyProcessed.add(inputsInfo.firstCandleIndex)

        // create the outputs
        const outputs = await createOutputs(config, inputsInfo.nextTradeIndex)

        all.push([inputsInfo.firstCandleIndex, inputsInfo.nextTradeIndex])
        all.push(inputsInfo.inputs.flat())
        all.push(outputs)

        // update
        bar.update(i)

        if ((i % 1000 === 0)) {
            console.log(`\nSaving intermediate pregenerated samples to ${config.pregeneratedSamplesDataPath}...`)
            await fs.writeFile(config.pregeneratedSamplesDataPath, Buffer.from(new Float64Array(all.flat()).buffer))
        }
    }

    // done
    bar.stop()

    console.log(`Saving pregenerated samples to ${config.pregeneratedSamplesDataPath}...`)
    await fs.writeFile(config.pregeneratedSamplesDataPath, Buffer.from(new Float64Array(all.flat()).buffer))
}

const work2 = async () => {
    const config = {
        data: {
            folder: path.resolve(__dirname, '..', '..', 'data'),
            exchange: {
                name: 'binance'
            },
            symbol: Symbol.find('btcusdc'),
            candle: {
                periodSec: 60
            }
        },
        train: {
            candlesWindowCount: 120,
            candlesPreambleCount: 100,
            startTimestamp: new Date('2024-01-01T00:00:00Z'),
            endTimestamp: new Date('2024-12-31T23:59:59Z'),
            samplesCount: null,
            normalizeAroundZero: false,
            normalizationFactor: 1
        },
        candle: {
            periodSec: 60
        },
        trade: {
            maxDurationSec: 3600,
            tpPercent: 1 / 100,
            slPercent: 0.5 / 100
        }
    }
    const cachedResources = {}
    const samples = await Samples.create(config, cachedResources)
    console.log('Samples created:', samples)
}

const work3 = async () => {
    const config = {
        data: {
            folder: path.resolve('/tmp', 'data'),
            exchange: {
                name: 'binance'
            },
            symbol: Symbol.find('btcusdc'),
            candle: {
                periodSec: 60
            }
        },
        train: {
            candlesWindowCount: 3,
            candlesPreambleCount: 100,
            startTimestamp: new Date('2024-01-01T00:00:00Z'),
            endTimestamp: new Date('2024-12-31T23:59:59Z'),
            samplesCount: null,
            normalizeAroundZero: false,
            normalizationFactor: 1
        },
        candle: {
            periodSec: 60
        },
        trade: {
            maxDurationSec: 3600,
            tpPercent: 1 / 100,
            slPercent: 0.5 / 100
        }
    }

    {
        const totalCandlesCount = config.train.candlesWindowCount + config.train.candlesPreambleCount + 1
        const tradesPerCandle = 3
        const trades = []
        for (let candleIndex = 0; candleIndex < totalCandlesCount; candleIndex++) {
            for (let tradeIndex = 0; tradeIndex < tradesPerCandle; tradeIndex++) {
                const absoluteTradeIndex = candleIndex * tradesPerCandle + tradeIndex
                const tsUs = new Date('2024-01-01T00:00:00Z').getTime() * 1000 + candleIndex * 60000000 + tradeIndex * 15000000
                const price = 10000 + candleIndex * 1000 + tradeIndex * 100 * (tradeIndex % 2 ? 1 : -1)
                const baseQty = price / 100
                const quoteQty = baseQty * price
                trades.push(new Trade(
                    config.data.exchange.name,
                    config.data.symbol,
                    null,
                    Number(absoluteTradeIndex),
                    null,
                    Number(tsUs),
                    Number(price),
                    Number(baseQty),
                    Number(quoteQty),
                    (tradeIndex % 2) === 1
                ))
            }
        }

        // Write trades to binary file
        const tradesFilePath = paths.trades(config)
        await fs.mkdir(path.dirname(tradesFilePath), { recursive: true })

        // Each trade is 40 bytes: id (8) + tsUs (8) + price (8) + baseQty (8) + quoteQty (8)
        const buffer = Buffer.allocUnsafe(trades.length * 40)

        for (let i = 0; i < trades.length; i++) {
            const trade = trades[i]
            const offset = i * 40

            // Encode isBuyerMaker in the top 2 bits of the ID
            const flags = trade.isBuyerMaker ? 1 : 2
            const idWithFlags = BigInt(trade.remoteId) | (BigInt(flags) << 62n)

            buffer.writeBigUInt64LE(idWithFlags, offset)
            buffer.writeBigUInt64LE(BigInt(trade.tsUs), offset + 8)
            buffer.writeDoubleLE(trade.price, offset + 16)
            buffer.writeDoubleLE(trade.baseQty, offset + 24)
            buffer.writeDoubleLE(trade.quoteQty, offset + 32)
        }

        await fs.writeFile(tradesFilePath, buffer)
        console.log(`Written ${trades.length} trades to ${tradesFilePath}`)
    }

    // lets print all trades, coma separated, numerical values only
    const trades = await cache.trades(config)
    console.log('tradeIndex,localId,tsUs,price,baseQty,quoteQty,isBuyerMaker')
    for (let i = 0; i < trades.length; i++) {
        const trade = trades.read(i)
        console.log(`${i}, ${trade.remoteId}, ${new Date(trade.tsUs / 1000).toISOString()}, ${trade.price}, ${trade.baseQty}, ${trade.quoteQty}, ${trade.isBuyerMaker ? 1 : 0}`)
    }

    // Now compute a sample starting at index 0 (which will read preamble + training window)
    const sample = await Sample.compute(config, 0)
    console.log('\nSample computed:')
    console.log('Input length:', sample.rawInputs.length)
    console.log('Output length:', sample.rawOutputs.length)
    console.log('\nInputs:', Array.from(sample.rawInputs))
    console.log('\nOutputs:', Array.from(sample.rawOutputs))
}

work2()
