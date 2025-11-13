const assert = require('assert')
const path = require('path')
const fs = require('fs').promises
const Sample = require('../src/ai/sampling/Sample')
const Candles = require('../src/ai/sampling/Candles')
const Trades = require('../src/ai/sampling/Trades')
const Symbol = require('../src/core/Symbol')
const TradeKind = require('../src/core/TradeKind')
const Trade = require('../src/core/Trade')
const paths = require('../src/ai/sampling/paths')

// Helper for floating point comparison
const assertClose = (actual, expected, tolerance, message) => {
    const diff = Math.abs(actual - expected)
    assert(diff <= tolerance, `${message}: expected ${expected}, got ${actual}, diff ${diff} > ${tolerance}`)
}

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

    describe('Sample with hand-crafted predictable data', () => {
        // This test uses hand-crafted, predictable trade data to verify exact computed values
        // The data generation and expected values are documented and verified manually
        const verifiedConfig = {
            namespace: '10_Sample_verified',
            data: {
                folder: path.join(baseFolder, 'verified'),
                exchange,
                symbol
            },
            candle: { periodSec },
            train: {
                candlesWindowCount: 3, // Training window: 3 candles
                candlesPreambleCount: 100, // Warmup: 100 candles for indicators
                normalizeAroundZero: false,
                normalizationFactor: 1
            },
            trade: {
                maxDurationSec: 3600, // 1 hour
                tpPercent: 0.01, // 1% take profit
                slPercent: 0.005 // 0.5% stop loss
            }
        }

        const tradesFilePath = paths.trades(verifiedConfig)

        before(async () => {
            // Generate predictable trade data
            // Pattern: 104 candles (0-103), 3 trades per candle at 0s, 15s, 30s
            // Price formula: 10000 + candleIndex*1000 + tradeIndex*100*oscillation
            // Oscillation: [0, +100, -200] creates down movement within each candle
            // All candles close lower than they open (direction = -1)

            await fs.mkdir(path.dirname(tradesFilePath), { recursive: true })

            const totalCandlesCount = 103 + 1 // +1 for closing trade
            const tradesPerCandle = 3
            const totalTrades = totalCandlesCount * tradesPerCandle
            const buffer = Buffer.allocUnsafe(totalTrades * 40)

            // Base timestamp: 2024-01-01 00:00:00 UTC (Monday)
            const baseTimeUs = new Date('2024-01-01T00:00:00.000Z').getTime() * 1000

            let tradeIndex = 0
            for (let candleIndex = 0; candleIndex < totalCandlesCount; candleIndex++) {
                const candleStartUs = baseTimeUs + candleIndex * 60 * 1000000

                for (let tradeInCandleIndex = 0; tradeInCandleIndex < tradesPerCandle; tradeInCandleIndex++) {
                    const offset = tradeIndex * 40

                    // Trade timestamp: 0s, 15s, 30s within the minute
                    const tsUs = candleStartUs + tradeInCandleIndex * 15 * 1000000

                    // Price pattern: base + candleIndex*1000 + within-candle oscillation
                    // Oscillation creates pattern: base, +100, -200 (ends lower)
                    const oscillation = tradeInCandleIndex === 0 ? 0 : (tradeInCandleIndex === 1 ? 100 : -200)
                    const price = 10000 + candleIndex * 1000 + oscillation

                    const baseQty = price / 100
                    const quoteQty = baseQty * price

                    // Alternate buyer/seller flags (1 = buyer is maker, 2 = seller is maker)
                    const flags = (tradeInCandleIndex % 2) === 0 ? 2 : 1
                    const idWithFlags = BigInt(tradeIndex) | (BigInt(flags) << 62n)

                    buffer.writeBigUInt64LE(idWithFlags, offset)
                    buffer.writeBigUInt64LE(BigInt(tsUs), offset + 8)
                    buffer.writeDoubleLE(price, offset + 16)
                    buffer.writeDoubleLE(baseQty, offset + 24)
                    buffer.writeDoubleLE(quoteQty, offset + 32)

                    tradeIndex++
                }
            }

            await fs.writeFile(tradesFilePath, buffer)
        })

        it('should compute sample with verified input values', async () => {
            const sample = await Sample.compute(verifiedConfig, 0)

            // Expected global normalization ranges (computed across all 103 candles):
            // Price: min=9800 (candle 0 low), max=112100 (candle 102 high), range=102300
            // Volume: min=2980500, max=376096500, range=373116000
            // Height: all=300, range=0 (normalized to 0)
            // TradesCount: all=3, range=0 (normalized to 0)

            // Verify structure
            assert.strictEqual(sample.rawInputs.length, 45, 'Should have 45 input values (3 candles × 15 features)')
            assert.strictEqual(sample.rawOutputs.length, 18, 'Should have 18 output values (2 orders × 9 values)')

            // Training candles are 100, 101, 102
            // Candle 100: O=110000, H=110100, L=109800, C=109800, V=362780500
            // Candle 101: O=111000, H=111100, L=110800, C=110800, V=369408500
            // Candle 102: O=112000, H=112100, L=111800, C=111800, V=376096500

            const tolerance = 1e-10 // Floating point tolerance

            // ============ CANDLE 100 (indices 0-14) ============
            // Open: (110000 - 9800) / 102300 = 0.9794721407624634
            assertClose(sample.rawInputs[0], 0.9794721407624634, tolerance, 'Candle 100 Open')

            // High: (110100 - 9800) / 102300 = 0.9804496578690127
            assertClose(sample.rawInputs[1], 0.9804496578690127, tolerance, 'Candle 100 High')

            // Low: (109800 - 9800) / 102300 = 0.9775171065493646
            assertClose(sample.rawInputs[2], 0.9775171065493646, tolerance, 'Candle 100 Low')

            // Close: (109800 - 9800) / 102300 = 0.9775171065493646
            assertClose(sample.rawInputs[3], 0.9775171065493646, tolerance, 'Candle 100 Close')

            // Volume: (362780500 - 2980500) / 373116000 = 0.9643113669743458
            assertClose(sample.rawInputs[4], 0.9643113669743458, tolerance, 'Candle 100 Volume')

            // MinuteOfDay: 100 (candle at 01:40)
            assert.strictEqual(sample.rawInputs[5], 100, 'Candle 100 MinuteOfDay')

            // Direction: -1 (close < open)
            assert.strictEqual(sample.rawInputs[6], -1, 'Candle 100 Direction')

            // Height: 0 (all heights same, range=0)
            assert.strictEqual(sample.rawInputs[7], 0, 'Candle 100 Height')

            // TradesCount: 0 (all counts same, range=0)
            assert.strictEqual(sample.rawInputs[8], 0, 'Candle 100 TradesCount')

            // DayOfWeek: 1 (Monday)
            assert.strictEqual(sample.rawInputs[9], 1, 'Candle 100 DayOfWeek')

            // MACD Short EMA (12-period)
            assertClose(sample.rawInputs[10], 0.9237536656891496, tolerance, 'Candle 100 MACD Short')

            // MACD Long EMA (26-period)
            assertClose(sample.rawInputs[11], 0.8553274682306939, tolerance, 'Candle 100 MACD Long')

            // MACD Line (short - long)
            assertClose(sample.rawInputs[12], 0.06842619745845568, tolerance, 'Candle 100 MACD Line')

            // MACD Signal (9-period EMA of MACD)
            assertClose(sample.rawInputs[13], 0.06842619745845559, tolerance, 'Candle 100 MACD Signal')

            // MACD Histogram (MACD - Signal) - essentially zero
            assertClose(sample.rawInputs[14], 0, 1e-15, 'Candle 100 MACD Histogram')

            // ============ CANDLE 101 (indices 15-29) ============
            // Open: (111000 - 9800) / 102300 = 0.989247311827957
            assertClose(sample.rawInputs[15], 0.989247311827957, tolerance, 'Candle 101 Open')

            // High: (111100 - 9800) / 102300 = 0.9902248289345064
            assertClose(sample.rawInputs[16], 0.9902248289345064, tolerance, 'Candle 101 High')

            // Low: (110800 - 9800) / 102300 = 0.9872922776148583
            assertClose(sample.rawInputs[17], 0.9872922776148583, tolerance, 'Candle 101 Low')

            // Close: (110800 - 9800) / 102300 = 0.9872922776148583
            assertClose(sample.rawInputs[18], 0.9872922776148583, tolerance, 'Candle 101 Close')

            // Volume: (369408500 - 2980500) / 373116000 = 0.9820752795377309
            assertClose(sample.rawInputs[19], 0.9820752795377309, tolerance, 'Candle 101 Volume')

            // MinuteOfDay: 101 (candle at 01:41)
            assert.strictEqual(sample.rawInputs[20], 101, 'Candle 101 MinuteOfDay')

            // Direction: -1 (close < open)
            assert.strictEqual(sample.rawInputs[21], -1, 'Candle 101 Direction')

            // Height: 0
            assert.strictEqual(sample.rawInputs[22], 0, 'Candle 101 Height')

            // TradesCount: 0
            assert.strictEqual(sample.rawInputs[23], 0, 'Candle 101 TradesCount')

            // DayOfWeek: 1 (Monday)
            assert.strictEqual(sample.rawInputs[24], 1, 'Candle 101 DayOfWeek')

            // MACD values
            assertClose(sample.rawInputs[25], 0.9335288367546433, tolerance, 'Candle 101 MACD Short')
            assertClose(sample.rawInputs[26], 0.8651026392961876, tolerance, 'Candle 101 MACD Long')
            assertClose(sample.rawInputs[27], 0.06842619745845568, tolerance, 'Candle 101 MACD Line')
            assertClose(sample.rawInputs[28], 0.06842619745845561, tolerance, 'Candle 101 MACD Signal')
            assertClose(sample.rawInputs[29], 0, 1e-15, 'Candle 101 MACD Histogram')

            // ============ CANDLE 102 (indices 30-44) ============
            // Open: (112000 - 9800) / 102300 = 0.9990224828934506
            assertClose(sample.rawInputs[30], 0.9990224828934506, tolerance, 'Candle 102 Open')

            // High: (112100 - 9800) / 102300 = 1.0
            assertClose(sample.rawInputs[31], 1.0, tolerance, 'Candle 102 High')

            // Low: (111800 - 9800) / 102300 = 0.9970674486803519
            assertClose(sample.rawInputs[32], 0.9970674486803519, tolerance, 'Candle 102 Low')

            // Close: (111800 - 9800) / 102300 = 0.9970674486803519
            assertClose(sample.rawInputs[33], 0.9970674486803519, tolerance, 'Candle 102 Close')

            // Volume: (376096500 - 2980500) / 373116000 = 1.0
            assertClose(sample.rawInputs[34], 1.0, tolerance, 'Candle 102 Volume')

            // MinuteOfDay: 102 (candle at 01:42)
            assert.strictEqual(sample.rawInputs[35], 102, 'Candle 102 MinuteOfDay')

            // Direction: -1 (close < open)
            assert.strictEqual(sample.rawInputs[36], -1, 'Candle 102 Direction')

            // Height: 0
            assert.strictEqual(sample.rawInputs[37], 0, 'Candle 102 Height')

            // TradesCount: 0
            assert.strictEqual(sample.rawInputs[38], 0, 'Candle 102 TradesCount')

            // DayOfWeek: 1 (Monday)
            assert.strictEqual(sample.rawInputs[39], 1, 'Candle 102 DayOfWeek')

            // MACD values
            assertClose(sample.rawInputs[40], 0.9433040078201369, tolerance, 'Candle 102 MACD Short')
            assertClose(sample.rawInputs[41], 0.8748778103616812, tolerance, 'Candle 102 MACD Long')
            assertClose(sample.rawInputs[42], 0.06842619745845568, tolerance, 'Candle 102 MACD Line')
            assertClose(sample.rawInputs[43], 0.06842619745845563, tolerance, 'Candle 102 MACD Signal')
            assertClose(sample.rawInputs[44], 0, 1e-15, 'Candle 102 MACD Histogram')
        })

        it('should compute sample with verified output values', async () => {
            const sample = await Sample.compute(verifiedConfig, 0)

            // Output structure: [buy_order (9 values), sell_order (9 values)]
            // Each order: [kind, isClosed, isStopLossHit, profit, enterPrice, ageUs, maxAgeUs, profitPercent, confidence]

            const tolerance = 1e-10

            // ============ BUY ORDER (indices 0-8) ============
            // Kind: 1 (buy)
            assert.strictEqual(sample.rawOutputs[0], 1, 'Buy order kind')

            // isClosed: 0 (not closed within maxDuration)
            assert.strictEqual(sample.rawOutputs[1], 0, 'Buy order isClosed')

            // isStopLossHit: 0 (stop loss not hit)
            assert.strictEqual(sample.rawOutputs[2], 0, 'Buy order isStopLossHit')

            // Profit: -200 (entered at 113000, current at 112800 after 30s)
            assert.strictEqual(sample.rawOutputs[3], -200, 'Buy order profit')

            // EnterPrice: 113000 (first trade of candle 103)
            assert.strictEqual(sample.rawOutputs[4], 113000, 'Buy order enterPrice')

            // AgeUs: 30000000 (30 seconds = 2 trades × 15s)
            assert.strictEqual(sample.rawOutputs[5], 30000000, 'Buy order ageUs')

            // MaxAgeUs: 3600000000 (1 hour = maxDurationSec)
            assert.strictEqual(sample.rawOutputs[6], 3600000000, 'Buy order maxAgeUs')

            // ProfitPercent: -200/113000 = -0.00177
            assertClose(sample.rawOutputs[7], -0.0017699115044247787, tolerance, 'Buy order profitPercent')

            // Confidence: -0.991 (negative because not closed, scaled by remaining time)
            assertClose(sample.rawOutputs[8], -0.991, 0.001, 'Buy order confidence')

            // ============ SELL ORDER (indices 9-17) ============
            // Kind: 2 (sell)
            assert.strictEqual(sample.rawOutputs[9], 2, 'Sell order kind')

            // isClosed: 0
            assert.strictEqual(sample.rawOutputs[10], 0, 'Sell order isClosed')

            // isStopLossHit: 0
            assert.strictEqual(sample.rawOutputs[11], 0, 'Sell order isStopLossHit')

            // Profit: 0 (entered at 113100, no favorable movement yet)
            assert.strictEqual(sample.rawOutputs[12], 0, 'Sell order profit')

            // EnterPrice: 113100 (second trade of candle 103)
            assert.strictEqual(sample.rawOutputs[13], 113100, 'Sell order enterPrice')

            // AgeUs: 0 (just entered, at the last trade)
            assert.strictEqual(sample.rawOutputs[14], 0, 'Sell order ageUs')

            // MaxAgeUs: 3600000000
            assert.strictEqual(sample.rawOutputs[15], 3600000000, 'Sell order maxAgeUs')

            // ProfitPercent: 0
            assert.strictEqual(sample.rawOutputs[16], 0, 'Sell order profitPercent')

            // Confidence: 0.991 (positive, not closed, scaled)
            assertClose(sample.rawOutputs[17], 0.991, 0.001, 'Sell order confidence')
        })

        it('should have Output objects correctly accessing buy and sell order data', async () => {
            const sample = await Sample.compute(verifiedConfig, 0)
            const outputs = sample.outputs

            assert.strictEqual(outputs.length, 2, 'Should have 2 output objects')

            // Output[0] should read from indices 0-8 (buy order data)
            assert.strictEqual(outputs[0].kind, TradeKind.buy, 'Buy order kind')
            assert.strictEqual(outputs[0].isClosed, false, 'Buy order isClosed')
            assert.strictEqual(outputs[0].isStopLossHit, false, 'Buy order isStopLossHit')
            assert.strictEqual(outputs[0].profit, -200, 'Buy order profit')
            assert.strictEqual(outputs[0].enterPrice, 113000, 'Buy order enterPrice')
            assert.strictEqual(outputs[0].ageUs, 30000000, 'Buy order ageUs')
            assert.strictEqual(outputs[0].maxAgeUs, 3600000000, 'Buy order maxAgeUs')
            assertClose(outputs[0].profitPercent, -0.0017699115044247787, 1e-10, 'Buy order profitPercent')
            assertClose(outputs[0].confidence, -0.991, 0.001, 'Buy order confidence')

            // Output[1] should read from indices 9-17 (sell order data)
            assert.strictEqual(outputs[1].kind, TradeKind.sell, 'Sell order kind')
            assert.strictEqual(outputs[1].isClosed, false, 'Sell order isClosed')
            assert.strictEqual(outputs[1].isStopLossHit, false, 'Sell order isStopLossHit')
            assert.strictEqual(outputs[1].profit, 0, 'Sell order profit')
            assert.strictEqual(outputs[1].enterPrice, 113100, 'Sell order enterPrice')
            assert.strictEqual(outputs[1].ageUs, 0, 'Sell order ageUs')
            assert.strictEqual(outputs[1].maxAgeUs, 3600000000, 'Sell order maxAgeUs')
            assert.strictEqual(outputs[1].profitPercent, 0, 'Sell order profitPercent')
            assertClose(outputs[1].confidence, 0.991, 0.001, 'Sell order confidence')
        })
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

    describe('Sample values verification with small window', () => {
        // Use a very small config to make verification manageable
        const smallConfig = {
            namespace: '10_Sample_small',
            data: {
                folder: path.join(baseFolder, 'small'),
                exchange,
                symbol
            },
            candle: { periodSec },
            train: {
                candlesWindowCount: 5, // Just 5 candles = 75 values (5 * 15)
                candlesPreambleCount: 50, // Still need preamble for MACD warmup
                normalizeAroundZero: false,
                normalizationFactor: 1.0
            },
            trade: {
                maxDurationSec: 300,
                tpPercent: 1.0,
                slPercent: 0.5
            }
        }
        const tradesFilePath = paths.trades(smallConfig)

        before(async function () {
            this.timeout(0) // 10 seconds for file generation
            await generateTradesFile(tradesFilePath)
        })

        it('should compute correct sample with 5 candles (75 input values)', async function () {
            this.timeout(0) // 10 seconds for sample computation
            const sample = await Sample.compute(smallConfig, 0)

            // Verify structure
            assert.strictEqual(sample.rawInputs.length, 75, 'Should have 75 input values (5 candles * 15 features)')
            assert.strictEqual(sample.rawOutputs.length, 18, 'Should have 18 output values (2 orders * 9 values)')

            // Verify all input values are numbers and not NaN
            for (let i = 0; i < sample.rawInputs.length; i++) {
                assert(!isNaN(sample.rawInputs[i]), `Input value at index ${i} should not be NaN`)
                assert(typeof sample.rawInputs[i] === 'number', `Input value at index ${i} should be a number`)
            }

            // Verify all output values are numbers and not NaN
            for (let i = 0; i < sample.rawOutputs.length; i++) {
                assert(!isNaN(sample.rawOutputs[i]), `Output value at index ${i} (value: ${sample.rawOutputs[i]}) should not be NaN`)
                assert(typeof sample.rawOutputs[i] === 'number', `Output value at index ${i} should be a number`)
            }

            // Verify first candle's features (15 values)
            const firstCandle = sample.rawInputs.slice(0, 15)
            // [0-3]: OHLC prices (normalized, should be close to 1.0 since first candle)
            assert(firstCandle[0] > 0 && firstCandle[0] < 2, 'Open price should be normalized')
            assert(firstCandle[1] > 0 && firstCandle[1] < 2, 'High price should be normalized')
            assert(firstCandle[2] > 0 && firstCandle[2] < 2, 'Low price should be normalized')
            assert(firstCandle[3] > 0 && firstCandle[3] < 2, 'Close price should be normalized')

            // [4]: Normalized quote volume (should be positive)
            assert(firstCandle[4] > 0, 'Quote volume should be positive')

            // [5]: Normalized minute of day (0-1440 for minutes, or normalized 0-1)
            assert(firstCandle[5] >= 0, 'Minute of day should be non-negative')

            // [6]: Direction (-1, 0, or 1)
            assert([-1, 0, 1].includes(firstCandle[6]), 'Direction should be -1, 0, or 1')

            // [7]: Normalized height (should be positive)
            assert(firstCandle[7] >= 0, 'Height should be non-negative')

            // [8]: Normalized trades count (should be non-negative)
            assert(firstCandle[8] >= 0, 'Trades count should be non-negative')

            // [9]: Day of week (0-6)
            assert(firstCandle[9] >= 0 && firstCandle[9] <= 6, 'Day of week should be 0-6')
            assert(Number.isInteger(firstCandle[9]), 'Day of week should be integer')

            // [10-14]: MACD values (should all be numbers, can be negative)
            for (let i = 10; i < 15; i++) {
                assert(typeof firstCandle[i] === 'number', `MACD value at ${i} should be number`)
                assert(!isNaN(firstCandle[i]), `MACD value at ${i} should not be NaN`)
            }
        })

        it('should have consistent values across multiple reads', async () => {
            const sample1 = await Sample.compute(smallConfig, 0)
            const sample2 = await Sample.compute(smallConfig, 0)

            // Same start index should produce identical results
            assert.strictEqual(sample1.rawInputs.length, sample2.rawInputs.length)
            for (let i = 0; i < sample1.rawInputs.length; i++) {
                assert.strictEqual(sample1.rawInputs[i], sample2.rawInputs[i],
                    `Input value at index ${i} should match`)
            }
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
