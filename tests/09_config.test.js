const assert = require('assert')
const path = require('path')
const fs = require('fs')
const { loadConfig } = require('../src/ai/config')

describe('config', () => {
    const testConfigDir = path.join(__dirname, 'fixtures', '11_config')
    const testConfigPath = path.join(testConfigDir, 'test-config.json')

    before(async () => {
        // Create test fixture directory and config file
        await fs.promises.mkdir(testConfigDir, { recursive: true })

        const testConfig = {
            data: {
                folder: 'persistent',
                exchange: {
                    name: 'binance'
                },
                symbol: 'btcusdc',
                candle: {
                    periodSec: 60
                }
            },
            train: {
                candlesWindowCount: 120,
                candlesPreambleCount: 100,
                startTimestamp: '2024-01-01T00:00:00Z',
                endTimestamp: '2024-12-31T23:59:59Z',
                samplesCount: 1000,
                normalizeAroundZero: false,
                normalizationFactor: 1
            },
            candle: {
                periodSec: 60
            },
            trade: {
                maxDurationSec: 3600,
                tpPercent: 1.5,
                slPercent: 0.75
            }
        }

        await fs.promises.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2))
    })

    after(async () => {
        // Clean up test fixtures
        await fs.promises.rm(testConfigDir, { recursive: true, force: true })
    })

    describe('loadConfig', () => {
        describe('loading from different path formats', () => {
            it('should load config from absolute path', () => {
                const config = loadConfig(testConfigPath)

                assert.ok(config, 'Config should be loaded')
                assert.strictEqual(config.data.exchange.name, 'binance')
            })

            it('should load config from path with .json extension', () => {
                // Using a path with .json extension triggers direct require
                const config = loadConfig(testConfigPath)

                assert.ok(config, 'Config should be loaded')
                assert.strictEqual(config.data.exchange.name, 'binance')
                assert.strictEqual(config.data.symbol.baseAssetName, 'btc')
            })

            it('should load config from name only (predefined location)', () => {
                // This will load from configs/simple.json
                const config = loadConfig('simple')

                assert.ok(config, 'Config should be loaded')
                assert.strictEqual(config.data.exchange.name, 'binance')
            })
        })

        describe('property transformations', () => {
            it('should transform symbol string to Symbol object', () => {
                const config = loadConfig(testConfigPath)

                assert.ok(config.data.symbol instanceof Object, 'Symbol should be an object')
                assert.strictEqual(config.data.symbol.baseAssetName, 'btc')
                assert.strictEqual(config.data.symbol.quoteAssetName, 'usdc')
            })

            it('should handle different symbol formats', () => {
                const config = loadConfig('simple')
                const symbol = config.data.symbol

                assert.ok(symbol, 'Symbol should be loaded')
                assert.strictEqual(typeof symbol.baseAssetName, 'string')
                assert.strictEqual(typeof symbol.quoteAssetName, 'string')
            })

            it('should transform timestamp strings to Date objects', () => {
                const config = loadConfig(testConfigPath)

                assert.ok(config.train.startTimestamp instanceof Date, 'startTimestamp should be a Date')
                assert.ok(config.train.endTimestamp instanceof Date, 'endTimestamp should be a Date')

                assert.strictEqual(config.train.startTimestamp.toISOString(), '2024-01-01T00:00:00.000Z')
                assert.strictEqual(config.train.endTimestamp.toISOString(), '2024-12-31T23:59:59.000Z')
            })

            it('should convert percent values to decimals', () => {
                const config = loadConfig(testConfigPath)

                // Original values: tpPercent: 1.5, slPercent: 0.75
                // Should be divided by 100
                assert.strictEqual(config.trade.tpPercent, 0.015)
                assert.strictEqual(config.trade.slPercent, 0.0075)
            })

            it('should handle samplesCount being null or a number', () => {
                const config = loadConfig(testConfigPath)

                // Test config has samplesCount: 1000
                assert.strictEqual(config.train.samplesCount, 1000)

                // Simple config has samplesCount: 100000
                const simpleConfig = loadConfig('simple')
                assert.strictEqual(simpleConfig.train.samplesCount, 100000)
            })
        })

        describe('config structure validation', () => {
            it('should have all required data properties', () => {
                const config = loadConfig(testConfigPath)

                assert.ok(config.data, 'Should have data property')
                assert.ok(config.data.folder, 'Should have data.folder')
                assert.ok(config.data.exchange, 'Should have data.exchange')
                assert.ok(config.data.exchange.name, 'Should have data.exchange.name')
                assert.ok(config.data.symbol, 'Should have data.symbol')
                assert.ok(config.data.candle, 'Should have data.candle')
                assert.ok(config.data.candle.periodSec, 'Should have data.candle.periodSec')
            })

            it('should have all required train properties', () => {
                const config = loadConfig(testConfigPath)

                assert.ok(config.train, 'Should have train property')
                assert.ok(typeof config.train.candlesWindowCount === 'number', 'Should have candlesWindowCount')
                assert.ok(typeof config.train.candlesPreambleCount === 'number', 'Should have candlesPreambleCount')
                assert.ok(config.train.startTimestamp instanceof Date, 'Should have startTimestamp as Date')
                assert.ok(config.train.endTimestamp instanceof Date, 'Should have endTimestamp as Date')
                assert.ok(typeof config.train.normalizeAroundZero === 'boolean', 'Should have normalizeAroundZero')
                assert.ok(typeof config.train.normalizationFactor === 'number', 'Should have normalizationFactor')
            })

            it('should have all required trade properties', () => {
                const config = loadConfig(testConfigPath)

                assert.ok(config.trade, 'Should have trade property')
                assert.ok(typeof config.trade.maxDurationSec === 'number', 'Should have maxDurationSec')
                assert.ok(typeof config.trade.tpPercent === 'number', 'Should have tpPercent')
                assert.ok(typeof config.trade.slPercent === 'number', 'Should have slPercent')
            })

            it('should have candle property', () => {
                const config = loadConfig(testConfigPath)

                assert.ok(config.candle, 'Should have candle property')
                assert.ok(typeof config.candle.periodSec === 'number', 'Should have candle.periodSec')
            })
        })

        describe('transformed values are correct', () => {
            it('should correctly parse symbol for BTCUSDC', () => {
                const config = loadConfig(testConfigPath)
                const symbol = config.data.symbol

                assert.strictEqual(symbol.baseAssetName, 'btc')
                assert.strictEqual(symbol.quoteAssetName, 'usdc')
            })

            it('should convert percent to decimal correctly', () => {
                const config = loadConfig(testConfigPath)

                // 1.5% = 0.015
                assert.strictEqual(config.trade.tpPercent, 0.015)
                // 0.75% = 0.0075
                assert.strictEqual(config.trade.slPercent, 0.0075)
            })

            it('should preserve numeric values that are not transformed', () => {
                const config = loadConfig(testConfigPath)

                assert.strictEqual(config.data.candle.periodSec, 60)
                assert.strictEqual(config.candle.periodSec, 60)
                assert.strictEqual(config.train.candlesWindowCount, 120)
                assert.strictEqual(config.train.candlesPreambleCount, 100)
                assert.strictEqual(config.trade.maxDurationSec, 3600)
            })

            it('should preserve boolean values', () => {
                const config = loadConfig(testConfigPath)

                assert.strictEqual(config.train.normalizeAroundZero, false)
                assert.strictEqual(typeof config.train.normalizeAroundZero, 'boolean')
            })
        })
    })
})
