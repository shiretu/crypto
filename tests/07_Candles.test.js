const assert = require('assert')
const fs = require('fs').promises
const path = require('path')
const Candles = require('../src/ai/common/Candles')
const Trades = require('../src/ai/common/Trades')
const Candle = require('../src/core/Candle')
const Symbol = require('../src/core/Symbol')
const paths = require('../src/ai/common/paths')

describe('Candles', () => {
    // We'll create 1000 trades, but only 99 candles will be generated
    // (the last 10 trades form an incomplete candle that won't be closed)
    const totalTrades = 1000
    const tradesPerCandle = 10
    const expectedCandles = 99 // Only closed candles are written
    const candlePeriodSec = 60
    // Align to candle boundary: round up to next multiple of 60M microseconds
    const baseTime = Math.ceil(1700000000000000 / 60000000) * 60000000

    // Test configuration
    const namespace = '09_Candles'
    const config = {
        namespace,
        data: {
            folder: path.join(__dirname, 'fixtures', namespace),
            exchange: { name: 'binance' },
            symbol: Symbol.find('BTCUSDC')
        },
        candle: { periodSec: candlePeriodSec }
    }
    const tradesFilePath = paths.trades(config)
    const candlesFilePath = paths.candles(config)

    before(async () => {
        // Generate test trades - 1000 trades that will form 99 candles (10 trades per minute)
        await fs.mkdir(path.dirname(tradesFilePath), { recursive: true })
        const buffer = Buffer.allocUnsafe(totalTrades * 40) // 40 bytes per trade

        for (let i = 0; i < totalTrades; i++) {
            const offset = i * 40
            const candleIndex = Math.floor(i / tradesPerCandle)
            const tradeInCandleIndex = i % tradesPerCandle

            // Each candle spans 60 seconds (60,000,000 microseconds)
            // Trades within a candle are spread across that period
            // With 10 trades per candle, space them 6 seconds (6,000,000 microseconds) apart
            // This ensures all 10 trades stay within the 60-second window
            const tsUs = baseTime + (candleIndex * 60000000) + (tradeInCandleIndex * 5000000) // 5 sec apart

            // Price oscillates within each candle: starts at base, goes up, then down
            const basePrice = 40000.0 + (candleIndex * 10) // Increases by $10 per candle
            let price = basePrice
            if (tradeInCandleIndex < 5) {
                price = basePrice + tradeInCandleIndex * 2 // Goes up to +8
            } else {
                price = basePrice + (10 - tradeInCandleIndex) * 2 // Goes back down
            }

            const baseQty = 0.01
            const quoteQty = price * baseQty
            const isBuyerMaker = i % 2 === 0

            // Encode flags in top 2 bits of id
            const flags = isBuyerMaker ? 1 : 0
            const flagShifted = flags * Math.pow(2, 62)
            const idWithFlags = BigInt(1000 + i) | BigInt(flagShifted)

            buffer.writeBigUInt64LE(idWithFlags, offset + 0)
            buffer.writeBigUInt64LE(BigInt(tsUs), offset + 8)
            buffer.writeDoubleLE(price, offset + 16)
            buffer.writeDoubleLE(baseQty, offset + 24)
            buffer.writeDoubleLE(quoteQty, offset + 32)
        }

        await fs.writeFile(tradesFilePath, buffer)
    })

    after(async () => {
        // Clean up test files
        await fs.rm(config.data.folder, { recursive: true, force: true })
    })

    describe('Candle generation from trades', () => {
        it('should generate candles file from trades', async () => {
            // This should trigger generation since candles file doesn't exist yet
            const candles = await Candles.create(config)

            assert.strictEqual(candles.length, expectedCandles, `Should have generated ${expectedCandles} candles`)
        })

        it('should create candles binary file with correct size', async () => {
            // Verify the file was actually created
            const stats = await fs.stat(candlesFilePath)
            assert(stats.isFile(), 'Should create a file')

            // Each candle record is 8 bytes (2 x Uint32: startTradeIndex, tradesCount)
            const expectedSize = expectedCandles * 8
            assert.strictEqual(stats.size, expectedSize, `File should be ${expectedSize} bytes`)
        })
    })

    describe('Reading candles from file', () => {
        let candles

        before(async () => {
            candles = await Candles.create(config)
        })

        it('should have correct length', () => {
            assert.strictEqual(candles.length, expectedCandles, 'Should have 99 candles')
        })

        it('should read first candle correctly', () => {
            const candleInfo = candles.read(0)

            assert.strictEqual(candleInfo.startTradeIndex, 0, 'First candle should start at trade 0')
            assert.strictEqual(candleInfo.tradesCount, tradesPerCandle, `Should have ${tradesPerCandle} trades`)
            assert(candleInfo.candle instanceof Candle, 'Should return Candle instance')
        })

        it('should read last candle correctly', () => {
            const candleInfo = candles.read(expectedCandles - 1)

            const expectedStartIndex = (expectedCandles - 1) * tradesPerCandle
            assert.strictEqual(candleInfo.startTradeIndex, expectedStartIndex, 'Last candle should start at correct index')
            assert.strictEqual(candleInfo.tradesCount, tradesPerCandle, `Should have ${tradesPerCandle} trades`)
            assert(candleInfo.candle instanceof Candle, 'Should return Candle instance')
        })

        it('should read middle candle correctly', () => {
            const candleInfo = candles.read(50)

            const expectedStartIndex = 50 * tradesPerCandle
            assert.strictEqual(candleInfo.startTradeIndex, expectedStartIndex, 'Middle candle should start at correct index')
            assert.strictEqual(candleInfo.tradesCount, tradesPerCandle, `Should have ${tradesPerCandle} trades`)
        })

        it('should have sequential trade indices', () => {
            const candle0 = candles.read(0)
            const candle1 = candles.read(1)
            const candle2 = candles.read(2)

            assert.strictEqual(candle1.startTradeIndex - candle0.startTradeIndex, tradesPerCandle, 'Candles should have sequential trade indices')
            assert.strictEqual(candle2.startTradeIndex - candle1.startTradeIndex, tradesPerCandle, 'Candles should have sequential trade indices')
        })

        it('should create valid Candle objects with OHLC data', () => {
            const candleInfo = candles.read(0)
            const candle = candleInfo.candle

            assert(candle.open, 'Should have open price')
            assert(candle.high, 'Should have high price')
            assert(candle.low, 'Should have low price')
            assert(candle.close, 'Should have close price')
            assert(candle.volumes.base > 0, 'Should have base volume')
            assert(candle.volumes.quote > 0, 'Should have quote volume')
        })

        it('should have correct candle period', () => {
            const candleInfo0 = candles.read(0)
            const candleInfo1 = candles.read(1)

            const timeDiff = candleInfo1.candle.tsUs.open - candleInfo0.candle.tsUs.open
            const expectedDiff = candlePeriodSec * 1000000 // Convert to microseconds

            assert.strictEqual(timeDiff, expectedDiff, 'Candles should be one period apart')
        })

        it('should have prices within expected range', () => {
            for (let i = 0; i < 10; i++) {
                const candleInfo = candles.read(i)
                const candle = candleInfo.candle

                // Based on our trade generation: basePrice = 40000 + (i * 10)
                // Trades go from base to base+8 and back
                const expectedBase = 40000.0 + (i * 10)

                assert(candle.low.price >= expectedBase - 1, `Candle ${i} low should be near ${expectedBase}`)
                assert(candle.high.price <= expectedBase + 10, `Candle ${i} high should be near ${expectedBase + 8}`)
            }
        })
    })

    describe('Reading bulk candles', () => {
        let candles

        before(async () => {
            candles = await Candles.create(config)
        })

        it('should read bulk candles from start', () => {
            const result = candles.readBulk(0, 5)

            assert.strictEqual(result.candles.length, 5, 'Should return 5 candles')
            assert.strictEqual(result.firstCandleIndex, 0, 'First candle index should be 0')
            assert.strictEqual(result.firstTradeIndex, 0, 'First trade index should be 0')
            assert.strictEqual(result.tradesCount, 5 * tradesPerCandle, 'Should have correct total trades')
            assert.strictEqual(result.nextTradeIndex, 5 * tradesPerCandle, 'Next trade index should be correct')
        })

        it('should read bulk candles from middle', () => {
            const result = candles.readBulk(50, 10)

            assert.strictEqual(result.candles.length, 10, 'Should return 10 candles')
            assert.strictEqual(result.firstCandleIndex, 50, 'First candle index should be 50')
            assert.strictEqual(result.firstTradeIndex, 50 * tradesPerCandle, 'First trade index should be correct')
            assert.strictEqual(result.tradesCount, 10 * tradesPerCandle, 'Should have correct total trades')
        })

        it('should read bulk candles from end', () => {
            const result = candles.readBulk(94, 5)

            assert.strictEqual(result.candles.length, 5, 'Should return 5 candles')
            assert.strictEqual(result.firstCandleIndex, 94, 'First candle index should be 94')
            assert.strictEqual(result.firstTradeIndex, 94 * tradesPerCandle, 'First trade index should be correct')
        })

        it('should return all candles in bulk read', () => {
            const result = candles.readBulk(0, expectedCandles)

            assert.strictEqual(result.candles.length, expectedCandles, 'Should return all candles')
            assert.strictEqual(result.firstTradeIndex, 0, 'Should start at trade 0')
            // Last 10 trades (990-999) form an incomplete candle and are not included
            assert.strictEqual(result.nextTradeIndex, expectedCandles * tradesPerCandle, 'Should end at last closed candle trade')
        })

        it('should have sequential timestamps in bulk read', () => {
            const result = candles.readBulk(10, 5)

            for (let i = 1; i < result.candles.length; i++) {
                const prevCandle = result.candles[i - 1]
                const currCandle = result.candles[i]
                const timeDiff = currCandle.tsUs.open - prevCandle.tsUs.open
                const expectedDiff = candlePeriodSec * 1000000

                assert.strictEqual(timeDiff, expectedDiff, `Candles ${i - 1} and ${i} should be one period apart`)
            }
        })
    })

    describe('Binary search (find)', () => {
        let candles

        before(async () => {
            candles = await Candles.create(config)
        })

        it('should find candle by exact timestamp match', () => {
            // Get the timestamp of candle 30
            const targetCandle = candles.read(30)
            const targetTime = targetCandle.candle.tsUs.open

            const foundIndex = candles.find(candle => candle.tsUs.open - targetTime)

            assert.strictEqual(foundIndex, 30, 'Should find exact candle index')
        })

        it('should find closest candle when no exact match', () => {
            // Get a timestamp between candle 40 and 41
            const candle40 = candles.read(40)
            const candle41 = candles.read(41)
            const betweenTime = (candle40.candle.tsUs.open + candle41.candle.tsUs.open) / 2

            const foundIndex = candles.find(candle => candle.tsUs.open - betweenTime)

            assert(foundIndex === 40 || foundIndex === 41, 'Should find closest candle')
        })

        it('should find first candle when searching for early timestamp', () => {
            const earlyTime = baseTime - 1000000 // Before first candle

            const foundIndex = candles.find(candle => candle.tsUs.open - earlyTime)

            assert.strictEqual(foundIndex, 0, 'Should return first candle for early timestamp')
        })

        it('should find last candle when searching for late timestamp', () => {
            const lateTime = baseTime + (expectedCandles * 60000000) + 1000000 // After last candle

            const foundIndex = candles.find(candle => candle.tsUs.open - lateTime)

            assert.strictEqual(foundIndex, expectedCandles - 1, 'Should return last candle for late timestamp')
        })
    })

    describe('Edge cases', () => {
        let candles

        before(async () => {
            candles = await Candles.create(config)
        })

        it('should handle reading candle at exact boundary', () => {
            const candleInfo = candles.read(expectedCandles - 1)

            assert(candleInfo.candle instanceof Candle, 'Should return valid candle at boundary')
        })

        it('should return consistent results on multiple reads', () => {
            const read1 = candles.read(25)
            const read2 = candles.read(25)

            assert.strictEqual(read1.startTradeIndex, read2.startTradeIndex, 'Should return same startTradeIndex')
            assert.strictEqual(read1.tradesCount, read2.tradesCount, 'Should return same tradesCount')
            assert.strictEqual(read1.candle.tsUs.open, read2.candle.tsUs.open, 'Should return same timestamp')
        })

        it('should load existing candles file without regeneration', async () => {
            // Create a second instance - should load from file, not regenerate
            const candles2 = await Candles.create(config)

            assert.strictEqual(candles2.length, expectedCandles, 'Should load same number of candles')

            // Compare a candle from both instances
            const candle1 = candles.read(50)
            const candle2 = candles2.read(50)

            assert.strictEqual(candle1.startTradeIndex, candle2.startTradeIndex, 'Loaded candles should match generated')
            assert.strictEqual(candle1.tradesCount, candle2.tradesCount, 'Loaded candles should match generated')
        })
    })
})
