const assert = require('assert')
const path = require('path')
const paths = require('../src/ai/sampling/paths')
const Symbol = require('../src/core/Symbol')

describe('paths', () => {
    describe('trades', () => {
        it('should generate correct trades path', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('BTCUSDC')
                }
            }

            const result = paths.trades(config)
            const expected = path.join('/data', 'data', 'binance', 'btc', 'usdc', 'trades.bin')

            assert.strictEqual(result, expected, 'Should generate correct trades path')
        })

        it('should handle different exchange', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'kraken' },
                    symbol: Symbol.find('BTCUSDC')
                }
            }

            const result = paths.trades(config)
            const expected = path.join('/data', 'data', 'kraken', 'btc', 'usdc', 'trades.bin')

            assert.strictEqual(result, expected)
        })

        it('should use lowercase for symbol parts', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('ETHUSDC')
                }
            }

            const result = paths.trades(config)
            const expected = path.join('/data', 'data', 'binance', 'eth', 'usdc', 'trades.bin')

            assert.strictEqual(result, expected, 'Should use lowercase for symbol')
        })
    })

    describe('candles', () => {
        it('should generate correct candles path with period', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('BTCUSDC')
                },
                candle: {
                    periodSec: 60
                }
            }

            const result = paths.candles(config)
            const expected = path.join('/data', 'data', 'binance', 'btc', 'usdc', '60', 'candles.bin')

            assert.strictEqual(result, expected, 'Should include period in path')
        })

        it('should handle different periods', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('BTCUSDC')
                },
                candle: {
                    periodSec: 300
                }
            }

            const result = paths.candles(config)
            const expected = path.join('/data', 'data', 'binance', 'btc', 'usdc', '300', 'candles.bin')

            assert.strictEqual(result, expected)
        })

        it('should work with any symbol', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('ETHUSDC')
                },
                candle: {
                    periodSec: 60
                }
            }

            const result = paths.candles(config)
            const expected = path.join('/data', 'data', 'binance', 'eth', 'usdc', '60', 'candles.bin')

            assert.strictEqual(result, expected)
        })
    })

    describe('model', () => {
        it('should generate correct model path', () => {
            const config = {
                folder: '/data',
                model: {
                    name: 'simple'
                }
            }

            const result = paths.model(config)
            const expected = path.join('/data', 'models', 'simple', 'arch.json')

            assert.strictEqual(result, expected, 'Should generate correct model path')
        })

        it('should handle different model names', () => {
            const config = {
                folder: '/data',
                model: {
                    name: 'lstm'
                }
            }

            const result = paths.model(config)
            const expected = path.join('/data', 'models', 'lstm', 'arch.json')

            assert.strictEqual(result, expected)
        })

        it('should work with complex model names', () => {
            const config = {
                folder: '/workspace',
                model: {
                    name: 'cnn-deep'
                }
            }

            const result = paths.model(config)
            const expected = path.join('/workspace', 'models', 'cnn-deep', 'arch.json')

            assert.strictEqual(result, expected)
        })
    })

    describe('samples', () => {
        it('should generate correct samples path', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('BTCUSDC')
                },
                candle: {
                    periodSec: 60
                },
                train: {
                    candlesWindowCount: 120
                },
                trade: {
                    maxDurationSec: 3600,
                    tpPercent: 1.5,
                    slPercent: 0.75
                }
            }

            const result = paths.samples(config)
            const expected = path.join('/data', 'data', 'binance', 'btc', 'usdc', '60', '120', '3600', '1.5', '0.75', 'samples.bin')

            assert.strictEqual(result, expected, 'Should include all training parameters')
        })

        it('should handle different training parameters', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('BTCUSDC')
                },
                candle: {
                    periodSec: 60
                },
                train: {
                    candlesWindowCount: 240
                },
                trade: {
                    maxDurationSec: 7200,
                    tpPercent: 2.0,
                    slPercent: 1.0
                }
            }

            const result = paths.samples(config)
            const expected = path.join('/data', 'data', 'binance', 'btc', 'usdc', '60', '240', '7200', '2', '1', 'samples.bin')

            assert.strictEqual(result, expected)
        })

        it('should work with different periods and symbols', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'kraken' },
                    symbol: Symbol.find('ETHUSDC')
                },
                candle: {
                    periodSec: 300
                },
                train: {
                    candlesWindowCount: 120
                },
                trade: {
                    maxDurationSec: 3600,
                    tpPercent: 1.5,
                    slPercent: 0.75
                }
            }

            const result = paths.samples(config)
            const expected = path.join('/data', 'data', 'kraken', 'eth', 'usdc', '300', '120', '3600', '1.5', '0.75', 'samples.bin')

            assert.strictEqual(result, expected)
        })
    })

    describe('path hierarchy', () => {
        it('should have trades as the base path', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('BTCUSDC')
                },
                candle: {
                    periodSec: 60
                },
                train: {
                    candlesWindowCount: 120
                },
                trade: {
                    maxDurationSec: 3600,
                    tpPercent: 1.5,
                    slPercent: 0.75
                }
            }

            const tradesPath = paths.trades(config)
            const candlesPath = paths.candles(config)
            const samplesPath = paths.samples(config)

            // Candles path should contain the base directory of trades path
            const tradesDir = path.dirname(tradesPath)
            assert(candlesPath.startsWith(tradesDir), 'Candles path should be under trades directory')

            // Samples path should be deeper than candles
            const candlesDir = path.dirname(candlesPath)
            assert(samplesPath.startsWith(candlesDir), 'Samples path should be under candles directory')
        })

        it('should create proper directory hierarchy', () => {
            const config = {
                data: {
                    folder: '/data',
                    exchange: { name: 'binance' },
                    symbol: Symbol.find('BTCUSDC')
                },
                candle: {
                    periodSec: 60
                },
                train: {
                    candlesWindowCount: 120
                },
                trade: {
                    maxDurationSec: 3600,
                    tpPercent: 1.5,
                    slPercent: 0.75
                }
            }

            const tradesPath = paths.trades(config)
            const candlesPath = paths.candles(config)
            const samplesPath = paths.samples(config)

            // Check structure: /data/binance/btc/usdc/...
            assert(tradesPath.includes('binance'), 'Should include exchange')
            assert(tradesPath.includes('btc'), 'Should include base currency')
            assert(tradesPath.includes('usdc'), 'Should include quote currency')

            // Candles adds period
            assert(candlesPath.includes('60'), 'Should include candle period')

            // Samples adds training parameters
            assert(samplesPath.includes('120'), 'Should include candles window count')
            assert(samplesPath.includes('3600'), 'Should include max duration')
            assert(samplesPath.includes('1.5'), 'Should include TP percent')
            assert(samplesPath.includes('0.75'), 'Should include SL percent')
        })
    })
})
