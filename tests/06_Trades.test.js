const assert = require('assert')
const fs = require('fs').promises
const path = require('path')

const paths = require('../src/ai/common/paths')
const Trades = require('../src/ai/common/Trades')
const Symbol = require('../src/core/Symbol')
const Trade = require('../src/core/Trade')

describe('Trades', () => {
    const namespace = '08_Trades'
    const config = {
        namespace,
        data: {
            folder: path.join(__dirname, 'fixtures', namespace),
            exchange: { name: 'binance' },
            symbol: Symbol.find('BTCUSDC')
        }
    }
    const testFilePath = paths.trades(config)

    // Test data: 50 trades with known values
    const testTrades = []
    const baseTime = 1700000000000000 // Starting timestamp in microseconds

    before(async () => {
        // Generate 50 test trades with predictable patterns
        for (let i = 0; i < 50; i++) {
            testTrades.push({
                id: 1000 + i,
                tsUs: baseTime + (i * 1000000), // 1 second apart
                price: 40000.0 + (i * 10), // Price increases by $10 each trade
                baseQty: 0.01 + (i * 0.001), // Quantity increases slightly
                quoteQty: (40000.0 + (i * 10)) * (0.01 + (i * 0.001)), // price * baseQty
                isBuyerMaker: i % 2 === 0 // Alternate between buy and sell
            })
        }

        // Create the binary file
        await fs.mkdir(path.dirname(testFilePath), { recursive: true })
        const buffer = Buffer.allocUnsafe(50 * 40) // 50 trades * 40 bytes

        for (let i = 0; i < 50; i++) {
            const offset = i * 40
            const trade = testTrades[i]

            // Encode flags in top 2 bits of id using bitwise OR
            // JavaScript numbers are safe up to 2^53, so we use BigInt only for the write operation
            const flags = trade.isBuyerMaker ? 1 : 0
            const flagShifted = flags * Math.pow(2, 62)
            const idWithFlags = BigInt(trade.id) | BigInt(flagShifted)

            buffer.writeBigUInt64LE(idWithFlags, offset + 0)
            buffer.writeBigUInt64LE(BigInt(trade.tsUs), offset + 8)
            buffer.writeDoubleLE(trade.price, offset + 16)
            buffer.writeDoubleLE(trade.baseQty, offset + 24)
            buffer.writeDoubleLE(trade.quoteQty, offset + 32)
        }

        await fs.writeFile(testFilePath, buffer)
    })

    after(async () => {
        // Clean up test files
        await fs.rm(config.data.folder, { recursive: true, force: true })
    })

    describe('File loading and basic properties', () => {
        it('should load trades from binary file', async () => {
            const trades = await Trades.create(config)
            assert.strictEqual(trades.length, 50, 'Should have 50 trades')
        })

        it('should calculate correct length from file size', async () => {
            const trades = await Trades.create(config)
            const stats = await fs.stat(testFilePath)
            assert.strictEqual(stats.size, 50 * 40, 'File should be 2000 bytes')
            assert.strictEqual(trades.length, 50, 'Length should match file size')
        })
    })

    describe('Reading individual trades', () => {
        let trades

        before(async () => {
            trades = await Trades.create(config)
        })

        it('should read first trade correctly', () => {
            const trade = trades.read(0)
            const expected = testTrades[0]

            assert(trade instanceof Trade, 'Should return Trade instance')
            assert.strictEqual(trade.remoteId, expected.id, 'ID should match')
            assert.strictEqual(trade.tsUs, expected.tsUs, 'Timestamp should match')
            assert.strictEqual(trade.price, expected.price, 'Price should match')
            assert.strictEqual(trade.baseQty, expected.baseQty, 'Base quantity should match')
            assert.strictEqual(trade.quoteQty, expected.quoteQty, 'Quote quantity should match')
            assert.strictEqual(trade.isBuyerMaker, expected.isBuyerMaker, 'isBuyerMaker should match')
        })

        it('should read last trade correctly', () => {
            const trade = trades.read(49)
            const expected = testTrades[49]

            assert.strictEqual(trade.remoteId, expected.id, 'ID should match')
            assert.strictEqual(trade.tsUs, expected.tsUs, 'Timestamp should match')
            assert.strictEqual(trade.price, expected.price, 'Price should match')
            assert.strictEqual(trade.baseQty, expected.baseQty, 'Base quantity should match')
            assert.strictEqual(trade.quoteQty, expected.quoteQty, 'Quote quantity should match')
            assert.strictEqual(trade.isBuyerMaker, expected.isBuyerMaker, 'isBuyerMaker should match')
        })

        it('should read middle trade correctly', () => {
            const trade = trades.read(25)
            const expected = testTrades[25]

            assert.strictEqual(trade.remoteId, expected.id, 'ID should match')
            assert.strictEqual(trade.tsUs, expected.tsUs, 'Timestamp should match')
            assert.strictEqual(trade.price, expected.price, 'Price should match')
            assert.strictEqual(trade.baseQty, expected.baseQty, 'Base quantity should match')
            assert.strictEqual(trade.quoteQty, expected.quoteQty, 'Quote quantity should match')
            assert.strictEqual(trade.isBuyerMaker, expected.isBuyerMaker, 'isBuyerMaker should match')
        })

        it('should correctly alternate isBuyerMaker flag', () => {
            for (let i = 0; i < 10; i++) {
                const trade = trades.read(i)
                const expected = i % 2 === 0
                assert.strictEqual(trade.isBuyerMaker, expected, `Trade ${i} should have isBuyerMaker = ${expected}`)
            }
        })

        it('should have sequential timestamps', () => {
            const trade0 = trades.read(0)
            const trade1 = trades.read(1)
            const trade2 = trades.read(2)

            assert.strictEqual(trade1.tsUs - trade0.tsUs, 1000000, 'Trades should be 1 second apart')
            assert.strictEqual(trade2.tsUs - trade1.tsUs, 1000000, 'Trades should be 1 second apart')
        })

        it('should have increasing prices', () => {
            const trade0 = trades.read(0)
            const trade10 = trades.read(10)
            const trade20 = trades.read(20)

            assert.strictEqual(trade0.price, 40000.0, 'First trade price should be 40000')
            assert.strictEqual(trade10.price, 40100.0, 'Trade 10 price should be 40100')
            assert.strictEqual(trade20.price, 40200.0, 'Trade 20 price should be 40200')
        })
    })

    describe('Reading bulk trades', () => {
        let trades

        before(async () => {
            trades = await Trades.create(config)
        })

        it('should read bulk trades starting from index 0', () => {
            const bulkTrades = trades.readBulk(0, 5)

            assert.strictEqual(bulkTrades.length, 5, 'Should return 5 trades')

            for (let i = 0; i < 5; i++) {
                const expected = testTrades[i]
                assert.strictEqual(bulkTrades[i].remoteId, expected.id, `Trade ${i} ID should match`)
                assert.strictEqual(bulkTrades[i].price, expected.price, `Trade ${i} price should match`)
            }
        })

        it('should read bulk trades from middle of file', () => {
            const bulkTrades = trades.readBulk(20, 10)

            assert.strictEqual(bulkTrades.length, 10, 'Should return 10 trades')

            for (let i = 0; i < 10; i++) {
                const expected = testTrades[20 + i]
                assert.strictEqual(bulkTrades[i].remoteId, expected.id, `Trade ${i} ID should match`)
                assert.strictEqual(bulkTrades[i].price, expected.price, `Trade ${i} price should match`)
            }
        })

        it('should read bulk trades at end of file', () => {
            const bulkTrades = trades.readBulk(45, 5)

            assert.strictEqual(bulkTrades.length, 5, 'Should return 5 trades')

            for (let i = 0; i < 5; i++) {
                const expected = testTrades[45 + i]
                assert.strictEqual(bulkTrades[i].remoteId, expected.id, `Trade ${i} ID should match`)
                assert.strictEqual(bulkTrades[i].price, expected.price, `Trade ${i} price should match`)
            }
        })

        it('should read single trade via readBulk', () => {
            const bulkTrades = trades.readBulk(10, 1)

            assert.strictEqual(bulkTrades.length, 1, 'Should return 1 trade')
            assert.strictEqual(bulkTrades[0].remoteId, testTrades[10].id, 'Trade ID should match')
        })

        it('should read all trades via readBulk', () => {
            const bulkTrades = trades.readBulk(0, 50)

            assert.strictEqual(bulkTrades.length, 50, 'Should return all 50 trades')

            // Verify first and last
            assert.strictEqual(bulkTrades[0].remoteId, testTrades[0].id, 'First trade should match')
            assert.strictEqual(bulkTrades[49].remoteId, testTrades[49].id, 'Last trade should match')
        })
    })

    describe('Trade field validation', () => {
        let trades

        before(async () => {
            trades = await Trades.create(config)
        })

        it('should preserve exchange name', () => {
            const trade = trades.read(0)
            assert.strictEqual(trade.exchangeName, 'binance', 'Exchange should be binance')
        })

        it('should preserve symbol', () => {
            const trade = trades.read(0)
            assert.strictEqual(trade.symbol.name('/'), 'BTC/USDC', 'Symbol should be BTC/USDC')
        })

        it('should handle large IDs correctly', () => {
            // The ID uses 62 bits (top 2 bits are flags)
            const trade = trades.read(0)
            assert(trade.remoteId >= 0, 'ID should be positive')
            assert(trade.remoteId < 2 ** 62, 'ID should fit in 62 bits')
        })

        it('should calculate quoteQty correctly', () => {
            for (let i = 0; i < 10; i++) {
                const trade = trades.read(i)
                const expected = testTrades[i]
                const calculatedQuoteQty = trade.price * trade.baseQty

                // Allow small floating point differences
                const diff = Math.abs(trade.quoteQty - calculatedQuoteQty)
                assert(diff < 0.00001, `Trade ${i} quoteQty should match price * baseQty`)
            }
        })
    })

    describe('Edge cases', () => {
        let trades

        before(async () => {
            trades = await Trades.create(config)
        })

        it('should handle reading trade at exact boundary', () => {
            const trade = trades.read(49) // Last valid index
            assert(trade instanceof Trade, 'Should return valid trade')
            assert.strictEqual(trade.remoteId, testTrades[49].id, 'Should read correct trade')
        })

        it('should return consistent results on multiple reads', () => {
            const trade1 = trades.read(15)
            const trade2 = trades.read(15)

            assert.strictEqual(trade1.remoteId, trade2.remoteId, 'Multiple reads should return same ID')
            assert.strictEqual(trade1.price, trade2.price, 'Multiple reads should return same price')
            assert.strictEqual(trade1.tsUs, trade2.tsUs, 'Multiple reads should return same timestamp')
        })
    })
})
