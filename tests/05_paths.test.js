const assert = require('assert')
const path = require('path')
const paths = require('../src/ai/common/paths')
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

    describe('config', () => {
        it('should generate correct config path', () => {
            const result = paths.config('simple')
            const expected = path.resolve(__dirname, '..', 'configs', 'simple.json')

            assert.strictEqual(result, expected, 'Should generate correct config path')
        })

        it('should handle different config names', () => {
            const result = paths.config('lstm')
            const expected = path.resolve(__dirname, '..', 'configs', 'lstm.json')

            assert.strictEqual(result, expected)
        })

        it('should work with hyphenated config names', () => {
            const result = paths.config('cnn-deep')
            const expected = path.resolve(__dirname, '..', 'configs', 'cnn-deep.json')

            assert.strictEqual(result, expected)
        })
    })

    describe('modelArch', () => {
        it('should generate correct model architecture path', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'simple'
                }
            }

            const result = paths.modelArch(config)
            const expected = path.join('/data', 'models', 'simple', 'arch.json')

            assert.strictEqual(result, expected, 'Should generate correct model path')
        })

        it('should handle different model names', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'lstm'
                }
            }

            const result = paths.modelArch(config)
            const expected = path.join('/data', 'models', 'lstm', 'arch.json')

            assert.strictEqual(result, expected)
        })

        it('should work with complex model names', () => {
            const config = {
                data: {
                    folder: '/workspace'
                },
                model: {
                    name: 'cnn-deep'
                }
            }

            const result = paths.modelArch(config)
            const expected = path.join('/workspace', 'models', 'cnn-deep', 'arch.json')

            assert.strictEqual(result, expected)
        })
    })

    describe('modelRunnerFolder', () => {
        it('should generate correct model runner folder path', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'simple',
                    runner: 'tf'
                }
            }

            const result = paths.modelRunnerFolder(config)
            const expected = path.join('/data', 'models', 'simple', 'tf')

            assert.strictEqual(result, expected, 'Should generate correct runner folder path')
        })

        it('should handle different runners', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'lstm',
                    runner: 'pt'
                }
            }

            const result = paths.modelRunnerFolder(config)
            const expected = path.join('/data', 'models', 'lstm', 'pt')

            assert.strictEqual(result, expected)
        })

        it('should work with complex model names and runners', () => {
            const config = {
                data: {
                    folder: '/workspace'
                },
                model: {
                    name: 'cnn-deep',
                    runner: 'tf'
                }
            }

            const result = paths.modelRunnerFolder(config)
            const expected = path.join('/workspace', 'models', 'cnn-deep', 'tf')

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

    describe('modelTrainLog', () => {
        it('should generate correct model train log path', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'simple',
                    runner: 'tf'
                }
            }

            const result = paths.modelTrainLog(config)
            const expected = path.join('/data', 'models', 'simple', 'tf', 'train.csv')

            assert.strictEqual(result, expected, 'Should generate correct train log path')
        })

        it('should handle different runners', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'lstm',
                    runner: 'pt'
                }
            }

            const result = paths.modelTrainLog(config)
            const expected = path.join('/data', 'models', 'lstm', 'pt', 'train.csv')

            assert.strictEqual(result, expected)
        })

        it('should be in the runner folder', () => {
            const config = {
                data: {
                    folder: '/workspace'
                },
                model: {
                    name: 'cnn-deep',
                    runner: 'tf'
                }
            }

            const runnerFolder = paths.modelRunnerFolder(config)
            const trainLog = paths.modelTrainLog(config)

            assert(trainLog.startsWith(runnerFolder), 'Train log should be in runner folder')
            assert(trainLog.endsWith('train.csv'), 'Train log should be named train.csv')
        })
    })

    describe('modelPredLog', () => {
        it('should generate correct model prediction log path', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'simple',
                    runner: 'tf'
                }
            }

            const result = paths.modelPredLog(config)
            const expected = path.join('/data', 'models', 'simple', 'tf', 'pred.csv')

            assert.strictEqual(result, expected, 'Should generate correct pred log path')
        })

        it('should handle different runners', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'lstm',
                    runner: 'pt'
                }
            }

            const result = paths.modelPredLog(config)
            const expected = path.join('/data', 'models', 'lstm', 'pt', 'pred.csv')

            assert.strictEqual(result, expected)
        })

        it('should be in the runner folder', () => {
            const config = {
                data: {
                    folder: '/workspace'
                },
                model: {
                    name: 'cnn-deep',
                    runner: 'tf'
                }
            }

            const runnerFolder = paths.modelRunnerFolder(config)
            const predLog = paths.modelPredLog(config)

            assert(predLog.startsWith(runnerFolder), 'Pred log should be in runner folder')
            assert(predLog.endsWith('pred.csv'), 'Pred log should be named pred.csv')
        })

        it('should be alongside train log', () => {
            const config = {
                data: {
                    folder: '/data'
                },
                model: {
                    name: 'simple',
                    runner: 'tf'
                }
            }

            const trainLog = paths.modelTrainLog(config)
            const predLog = paths.modelPredLog(config)

            assert.strictEqual(path.dirname(trainLog), path.dirname(predLog), 'Train and pred logs should be in same directory')
        })

        it('should work with different model names', () => {
            const config = {
                data: {
                    folder: '/workspace'
                },
                model: {
                    name: 'bilstm',
                    runner: 'tf'
                }
            }

            const result = paths.modelPredLog(config)
            const expected = path.join('/workspace', 'models', 'bilstm', 'tf', 'pred.csv')

            assert.strictEqual(result, expected)
        })
    })
})
