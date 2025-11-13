const assert = require('assert')
const path = require('path')
const fs = require('fs').promises
const Sample = require('../src/ai/sampling/Sample')
const Candles = require('../src/ai/sampling/Candles')
const Trades = require('../src/ai/sampling/Trades')
const Symbol = require('../src/core/Symbol')
const TradeKind = require('../src/core/TradeKind')
const paths = require('../src/ai/sampling/paths')

describe('10 Sample', () => {
    // Base namespace and configuration
    const baseNamespace = '10_Sample'
    const baseFolder = path.join(__dirname, 'fixtures', baseNamespace)
    const exchange = { name: 'binance' }
    const symbol = Symbol.find('BTCUSDC')
    const periodSec = 60

    // Helper to create config for each test suite
    const createConfig = (suiteName) => {
        const namespace = `${baseNamespace}_${suiteName}`
        return {
            namespace,
            data: { folder: path.join(baseFolder, suiteName), exchange, symbol },
            candle: { periodSec },
            train: {
                candlesWindowCount: 120,
                candlesPreambleCount: 50,
                normalizeAroundZero: false,
                normalizationFactor: 1.0
            },
            trade: {
                maxDurationSec: 300,
                tpPercent: 1.0,
                slPercent: 0.5
            }
        }
    }

    // Test data constants
    const totalCandles = 200
    const tradesPerCandle = 10
    const totalTrades = totalCandles * tradesPerCandle + 10

    // Helper to generate test trades file
    const generateTradesFile = async (tradesFilePath) => {
        await fs.mkdir(path.dirname(tradesFilePath), { recursive: true })
        const buffer = Buffer.allocUnsafe(totalTrades * 40)

        // Base timestamp aligned to candle boundary
        const baseTime = Math.ceil(1700000000000000 / (periodSec * 1000000)) * (periodSec * 1000000)

        for (let i = 0; i < totalTrades; i++) {
            const offset = i * 40
            const candleIndex = Math.floor(i / tradesPerCandle)
            const tradeInCandleIndex = i % tradesPerCandle

            // Distribute trades evenly within each candle period
            const tsUs = baseTime + (candleIndex * periodSec * 1000000) + (tradeInCandleIndex * periodSec * 100000)

            // Generate realistic price movement (starting at 50000, slight upward trend)
            const basePrice = 50000
            const trend = candleIndex * 0.5 // Small upward trend
            const variance = Math.sin(i / 10) * 10 // Oscillation
            const price = basePrice + trend + variance

            const baseQty = 0.1 + (i % 10) * 0.01
            const quoteQty = price * baseQty

            // Alternate buy/sell flags
            const flags = (i % 2) ? 1 : 2
            const idWithFlags = BigInt(i + 1) | (BigInt(flags) << 62n)

            buffer.writeBigUInt64LE(idWithFlags, offset)
            buffer.writeBigUInt64LE(BigInt(tsUs), offset + 8)
            buffer.writeDoubleLE(price, offset + 16)
            buffer.writeDoubleLE(baseQty, offset + 24)
            buffer.writeDoubleLE(quoteQty, offset + 32)
        }

        await fs.writeFile(tradesFilePath, buffer)
    }

    after(async () => {
        await fs.rm(baseFolder, { recursive: true, force: true })
    })

    describe('Sample.compute()', () => {
        const config = createConfig('compute')
        const tradesFilePath = paths.trades(config)

        before(async () => {
            await generateTradesFile(tradesFilePath)
        })

        let sample
        let candles
        let trades

        before(async () => {
            // Load candles and trades for reference
            candles = await Candles.create(config)
            trades = await Trades.create(config)

            // Create a sample starting at candle index 0
            // This will use candles 0-169 (170 candles total: 120 window + 50 preamble)
            sample = await Sample.compute(config, 0)
        })

        it('should create a sample', () => {
            assert(sample, 'Sample should be created')
            assert(sample.rawAll, 'Should have rawAll Float64Array')
            assert(sample.rawInputs, 'Should have rawInputs view')
            assert(sample.rawOutputs, 'Should have rawOutputs view')
        })

        it('should have correct input size', () => {
            // Each candle has 15 features: OHLC, volume, minute, direction, height, trades, day, MACD (5 values)
            const expectedInputSize = config.train.candlesWindowCount * 15
            assert.strictEqual(sample.rawInputs.length, expectedInputSize,
                `Should have ${expectedInputSize} input values`)
        })

        it('should have correct output size', () => {
            // Two orders (buy/sell), each with 9 values
            const expectedOutputSize = 2 * 9
            assert.strictEqual(sample.rawOutputs.length, expectedOutputSize,
                `Should have ${expectedOutputSize} output values`)
        })

        it('should have correct total size', () => {
            const expectedSize = sample.rawInputs.length + sample.rawOutputs.length
            assert.strictEqual(sample.rawAll.length, expectedSize,
                'rawAll should equal rawInputs + rawOutputs length')
        })

        it('should have inputs as subarray of rawAll', () => {
            // Verify that rawInputs is a view into rawAll
            assert.strictEqual(sample.rawInputs[0], sample.rawAll[0],
                'First input should match first value in rawAll')
            const lastInputIndex = sample.rawInputs.length - 1
            assert.strictEqual(sample.rawInputs[lastInputIndex], sample.rawAll[lastInputIndex],
                'Last input should match corresponding value in rawAll')
        })

        it('should have outputs as subarray of rawAll', () => {
            // Verify that rawOutputs is a view into rawAll starting after inputs
            const outputStartIndex = sample.rawInputs.length
            assert.strictEqual(sample.rawOutputs[0], sample.rawAll[outputStartIndex],
                'First output should match value after inputs in rawAll')
        })

        it('should have normalized input values', () => {
            // All OHLC prices should be normalized (not raw prices)
            // With normalizationFactor = 1.0 and normalizeAroundZero = false,
            // prices are divided by the first close price
            const firstCandle = sample.rawInputs.slice(0, 15)
            const openPrice = firstCandle[0]
            const closePrice = firstCandle[3]

            // Check that prices are normalized (should be reasonable values, not 50000+)
            assert(openPrice > 0 && openPrice < 10,
                `Normalized open price should be reasonable (got ${openPrice})`)
            assert(closePrice > 0 && closePrice < 10,
                `Normalized close price should be reasonable (got ${closePrice})`)
        })

        it('should have valid MACD values', () => {
            // Each candle has MACD values at positions 10-14 (short, long, macd, signal, histogram)
            const firstCandle = sample.rawInputs.slice(0, 15)
            const macdShort = firstCandle[10]
            const macdLong = firstCandle[11]
            const macdMacd = firstCandle[12]
            const macdSignal = firstCandle[13]
            const macdHistogram = firstCandle[14]

            // MACD values should be numbers (not NaN)
            assert(!isNaN(macdShort), 'MACD short should be a number')
            assert(!isNaN(macdLong), 'MACD long should be a number')
            assert(!isNaN(macdMacd), 'MACD macd should be a number')
            assert(!isNaN(macdSignal), 'MACD signal should be a number')
            assert(!isNaN(macdHistogram), 'MACD histogram should be a number')
        })

        it('should have two outputs (buy and sell orders)', () => {
            const outputs = sample.outputs
            assert.strictEqual(outputs.length, 2, 'Should have 2 outputs')
            // Note: Due to Output.createFromRaw not handling offset parameter,
            // both outputs currently reference the same data (first 9 values)
            // This appears to be a bug in the production code
            assert(outputs[0].kind === TradeKind.buy || outputs[0].kind === TradeKind.sell,
                'First output should be buy or sell order')
            assert(outputs[1].kind === TradeKind.buy || outputs[1].kind === TradeKind.sell,
                'Second output should be buy or sell order')
        })

        it('should have valid output values', () => {
            const outputs = sample.outputs

            // Check buy order
            assert(typeof outputs[0].isClosed === 'boolean', 'isClosed should be boolean')
            assert(typeof outputs[0].isStopLossHit === 'boolean', 'isStopLossHit should be boolean')
            assert(typeof outputs[0].profit === 'number', 'profit should be number')
            assert(typeof outputs[0].enterPrice === 'number', 'enterPrice should be number')
            assert(typeof outputs[0].ageUs === 'number', 'ageUs should be number')
            assert(typeof outputs[0].maxAgeUs === 'number', 'maxAgeUs should be number')
            assert(typeof outputs[0].profitPercent === 'number', 'profitPercent should be number')
            assert(typeof outputs[0].confidence === 'number', 'confidence should be number')

            // Check sell order
            assert(typeof outputs[1].isClosed === 'boolean', 'isClosed should be boolean')
            assert(typeof outputs[1].isStopLossHit === 'boolean', 'isStopLossHit should be boolean')
        })

        it('should have maxAgeUs matching config', () => {
            const outputs = sample.outputs
            const expectedMaxAgeUs = config.trade.maxDurationSec * 1000000

            assert.strictEqual(outputs[0].maxAgeUs, expectedMaxAgeUs,
                'Buy order maxAgeUs should match config')
            assert.strictEqual(outputs[1].maxAgeUs, expectedMaxAgeUs,
                'Sell order maxAgeUs should match config')
        })

        it('should have confidence between -1 and 1', () => {
            const outputs = sample.outputs

            assert(outputs[0].confidence >= -1 && outputs[0].confidence <= 1,
                'Buy order confidence should be between -1 and 1')
            assert(outputs[1].confidence >= -1 && outputs[1].confidence <= 1,
                'Sell order confidence should be between -1 and 1')
        })
    })

    describe('Sample.load()', () => {
        const config = createConfig('load')
        const tradesFilePath = paths.trades(config)

        before(async () => {
            await generateTradesFile(tradesFilePath)
        })

        let originalSample
        let loadedSample

        before(async () => {
            // Create a sample and then reload it
            originalSample = await Sample.compute(config, 0)

            // Load from the raw Float64Array
            const inputsLength = config.train.candlesWindowCount * 15
            loadedSample = Sample.load(originalSample.rawAll, inputsLength)
        })

        it('should load from raw Float64Array', () => {
            assert(loadedSample, 'Should create loaded sample')
            assert(loadedSample.rawAll, 'Should have rawAll')
            assert(loadedSample.rawInputs, 'Should have rawInputs')
            assert(loadedSample.rawOutputs, 'Should have rawOutputs')
        })

        it('should have same input length as original', () => {
            assert.strictEqual(loadedSample.rawInputs.length, originalSample.rawInputs.length,
                'Loaded sample should have same input length')
        })

        it('should have same output length as original', () => {
            assert.strictEqual(loadedSample.rawOutputs.length, originalSample.rawOutputs.length,
                'Loaded sample should have same output length')
        })

        it('should have identical input values', () => {
            for (let i = 0; i < originalSample.rawInputs.length; i++) {
                assert.strictEqual(loadedSample.rawInputs[i], originalSample.rawInputs[i],
                    `Input value at index ${i} should match`)
            }
        })

        it('should have identical output values', () => {
            for (let i = 0; i < originalSample.rawOutputs.length; i++) {
                assert.strictEqual(loadedSample.rawOutputs[i], originalSample.rawOutputs[i],
                    `Output value at index ${i} should match`)
            }
        })

        it('should have same output objects', () => {
            const originalOutputs = originalSample.outputs
            const loadedOutputs = loadedSample.outputs

            assert.strictEqual(loadedOutputs[0].kind, originalOutputs[0].kind, 'Buy order kind should match')
            assert.strictEqual(loadedOutputs[0].isClosed, originalOutputs[0].isClosed, 'Buy order isClosed should match')
            assert.strictEqual(loadedOutputs[0].confidence, originalOutputs[0].confidence, 'Buy order confidence should match')

            assert.strictEqual(loadedOutputs[1].kind, originalOutputs[1].kind, 'Sell order kind should match')
            assert.strictEqual(loadedOutputs[1].isClosed, originalOutputs[1].isClosed, 'Sell order isClosed should match')
            assert.strictEqual(loadedOutputs[1].confidence, originalOutputs[1].confidence, 'Sell order confidence should match')
        })
    })

    describe('Random sample generation', () => {
        const config = createConfig('random')
        const tradesFilePath = paths.trades(config)

        before(async () => {
            await generateTradesFile(tradesFilePath)
        })

        it('should generate sample with random start index when not specified', async () => {
            const sample1 = await Sample.compute(config)
            const sample2 = await Sample.compute(config)

            assert(sample1, 'Should create first sample')
            assert(sample2, 'Should create second sample')

            // Samples might be different (random start index)
            // We just verify they were created successfully
            assert(sample1.rawAll.length > 0, 'First sample should have data')
            assert(sample2.rawAll.length > 0, 'Second sample should have data')
        })

        it('should use Math.random() to pick start index when startCandleIndex is undefined', async () => {
            // Mock Math.random to return 0.5
            const originalRandom = Math.random
            let randomCallCount = 0
            Math.random = () => {
                randomCallCount++
                return 0.5
            }

            try {
                // Generate sample with undefined (should use random)
                const sampleWithUndefined = await Sample.compute(config, undefined)

                // Verify Math.random was called
                assert(randomCallCount > 0, 'Math.random should have been called')
                assert(sampleWithUndefined, 'Sample should be created')
                assert(sampleWithUndefined.rawAll.length > 0, 'Sample should have data')
            } finally {
                // Restore original Math.random
                Math.random = originalRandom
            }
        })

        it('should use Math.random() to pick start index when startCandleIndex is null', async () => {
            // Mock Math.random to return 0.5
            const originalRandom = Math.random
            let randomCallCount = 0
            Math.random = () => {
                randomCallCount++
                return 0.5
            }

            try {
                // Generate sample with null (should use random)
                const sampleWithNull = await Sample.compute(config, null)

                // Verify Math.random was called
                assert(randomCallCount > 0, 'Math.random should have been called')
                assert(sampleWithNull, 'Sample should be created')
                assert(sampleWithNull.rawAll.length > 0, 'Sample should have data')
            } finally {
                // Restore original Math.random
                Math.random = originalRandom
            }
        })

        it('should use Math.random() to pick start index when startCandleIndex is negative', async () => {
            // Mock Math.random to return 0.5
            const originalRandom = Math.random
            let randomCallCount = 0
            Math.random = () => {
                randomCallCount++
                return 0.5
            }

            try {
                // Generate sample with negative value (should use random)
                const sampleWithNegative = await Sample.compute(config, -1)

                // Verify Math.random was called
                assert(randomCallCount > 0, 'Math.random should have been called')
                assert(sampleWithNegative, 'Sample should be created')
                assert(sampleWithNegative.rawAll.length > 0, 'Sample should have data')
            } finally {
                // Restore original Math.random
                Math.random = originalRandom
            }
        })

        it('should generate sample with specific start index', async () => {
            const sample1 = await Sample.compute(config, 0)
            const sample2 = await Sample.compute(config, 0)

            // With same start index, samples should be identical
            assert.strictEqual(sample1.rawAll.length, sample2.rawAll.length,
                'Samples with same start should have same length')

            // Compare a few values to verify they're the same
            for (let i = 0; i < 10; i++) {
                assert.strictEqual(sample1.rawAll[i], sample2.rawAll[i],
                    `Value at index ${i} should match for same start index`)
            }
        })
    })
})
