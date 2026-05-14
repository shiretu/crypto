import fs from 'fs'
import path from 'path'
import { expect } from 'chai'
import NeuralNetwork from '../src/nn/NeuralNetwork.js'

const TEST_ARCH_NAME = '_test_nn_base'
const TEST_ARCH_DIR = path.resolve('configs', 'nn', TEST_ARCH_NAME)
const TEST_ARCH_FILE = path.join(TEST_ARCH_DIR, 'arch.json')
const TEST_RUNTIME_DIR = path.resolve('data', 'nn', 'runtimes', TEST_ARCH_NAME)

const ARCH = {
    layers: [
        { type: 'dense', units: 4, activation: 'relu', inputShape: [3] },
        { type: 'dense', units: 1, activation: 'sigmoid' }
    ]
}

const baseConfig = (overrides = {}) => ({
    name: TEST_ARCH_NAME,
    personality: {
        name: overrides.personalityName ?? 'unit',
        data: overrides.data ?? {
            symbol: 'binance:eth:usdc',
            candleDuration: 300,
            lookback: 10,
            tpPercent: 1,
            slPercent: 1
        },
        train: overrides.train ?? {
            learningRate: 0.01,
            epochs: 2,
            batchSize: 4
        }
    }
})

describe('NeuralNetwork', () => {
    before(() => {
        fs.mkdirSync(TEST_ARCH_DIR, { recursive: true })
        fs.writeFileSync(TEST_ARCH_FILE, JSON.stringify(ARCH))
    })

    after(() => {
        fs.rmSync(TEST_ARCH_DIR, { recursive: true, force: true })
        fs.rmSync(TEST_RUNTIME_DIR, { recursive: true, force: true })
    })

    describe('constructor validation', () => {
        it('should reject missing personality', () => {
            expect(() => new NeuralNetwork({ name: TEST_ARCH_NAME }))
                .to.throw('config.personality is required')
        })

        it('should reject missing personality.data', () => {
            expect(() => new NeuralNetwork({
                name: TEST_ARCH_NAME,
                personality: { name: 'x', train: { learningRate: 0.01 } }
            })).to.throw('config.personality.data is required')
        })

        it('should reject missing personality.train', () => {
            expect(() => new NeuralNetwork({
                name: TEST_ARCH_NAME,
                personality: { name: 'x', data: { lookback: 1 } }
            })).to.throw('config.personality.train is required')
        })

        it('should accept a valid config', () => {
            expect(() => new NeuralNetwork(baseConfig())).to.not.throw()
        })
    })

    describe('arch loading', () => {
        it('should expose arch parsed from arch.json', () => {
            const nn = new NeuralNetwork(baseConfig())
            expect(nn.arch).to.deep.equal(ARCH)
        })

        it('should throw if arch.json is missing', () => {
            expect(() => new NeuralNetwork(baseConfig({ }) /* same name */)).to.not.throw() // sanity
            const bogus = { ...baseConfig(), name: '_does_not_exist' }
            expect(() => new NeuralNetwork(bogus)).to.throw()
        })
    })

    describe('personality exposure', () => {
        it('should expose personality untouched', () => {
            const cfg = baseConfig()
            const nn = new NeuralNetwork(cfg)
            expect(nn.personality).to.equal(cfg.personality)
        })
    })

    describe('fingerprint and runtime directory', () => {
        it('should produce a deterministic runtime path for the same recipe', () => {
            const nnA = new NeuralNetwork(baseConfig())
            const nnB = new NeuralNetwork(baseConfig())
            expect(nnA.trainingRootPath).to.equal(nnB.trainingRootPath)
        })

        it('should ignore personality.name in the fingerprint', () => {
            const a = new NeuralNetwork(baseConfig({ personalityName: 'foo' }))
            const b = new NeuralNetwork(baseConfig({ personalityName: 'bar' }))
            expect(a.trainingRootPath).to.equal(b.trainingRootPath)
        })

        it('should change fingerprint when data changes', () => {
            const a = new NeuralNetwork(baseConfig())
            const b = new NeuralNetwork(baseConfig({
                data: {
                    symbol: 'binance:eth:usdc',
                    candleDuration: 60, // different
                    lookback: 10,
                    tpPercent: 1,
                    slPercent: 1
                }
            }))
            expect(a.trainingRootPath).to.not.equal(b.trainingRootPath)
        })

        it('should change fingerprint when train changes', () => {
            const a = new NeuralNetwork(baseConfig())
            const b = new NeuralNetwork(baseConfig({
                train: { learningRate: 0.02, epochs: 2, batchSize: 4 }
            }))
            expect(a.trainingRootPath).to.not.equal(b.trainingRootPath)
        })

        it('should be insensitive to key ordering within data/train', () => {
            const cfgA = baseConfig()
            const cfgB = {
                name: TEST_ARCH_NAME,
                personality: {
                    name: 'unit',
                    train: { batchSize: 4, epochs: 2, learningRate: 0.01 }, // reordered
                    data: { slPercent: 1, tpPercent: 1, lookback: 10, candleDuration: 300, symbol: 'binance:eth:usdc' }
                }
            }
            const a = new NeuralNetwork(cfgA)
            const b = new NeuralNetwork(cfgB)
            expect(a.trainingRootPath).to.equal(b.trainingRootPath)
        })

        it('should place runtime under data/nn/runtimes/<name>/<fingerprint>', () => {
            const nn = new NeuralNetwork(baseConfig())
            const expectedPrefix = TEST_RUNTIME_DIR
            expect(nn.trainingRootPath.startsWith(expectedPrefix + path.sep)).to.equal(true)
            const fp = path.basename(nn.trainingRootPath)
            expect(fp).to.match(/^[0-9a-f]{16}$/)
        })

        it('should create the runtime directory on disk', () => {
            const nn = new NeuralNetwork(baseConfig())
            expect(fs.existsSync(nn.trainingRootPath)).to.equal(true)
        })

        it('should write recipe.json on construction', () => {
            const cfg = baseConfig({ personalityName: 'recipe-test' })
            const nn = new NeuralNetwork(cfg)
            const recipePath = path.join(nn.trainingRootPath, 'recipe.json')
            expect(fs.existsSync(recipePath)).to.equal(true)
            const written = JSON.parse(fs.readFileSync(recipePath, 'utf8'))
            expect(written).to.deep.equal(cfg.personality)
        })
    })

    describe('abstract methods', () => {
        it('static create should throw not implemented', async () => {
            try {
                await NeuralNetwork.create(baseConfig())
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.include('not implemented')
            }
        })

        it('static load should throw not implemented', async () => {
            try {
                await NeuralNetwork.load(baseConfig())
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.include('not implemented')
            }
        })

        it('save should throw not implemented', async () => {
            const nn = new NeuralNetwork(baseConfig())
            try {
                await nn.save()
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.include('not implemented')
            }
        })

        it('train should throw not implemented', async () => {
            const nn = new NeuralNetwork(baseConfig())
            try {
                await nn.train({ inputs: [[1]], labels: [1] })
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.include('not implemented')
            }
        })

        it('predict should throw not implemented', async () => {
            const nn = new NeuralNetwork(baseConfig())
            try {
                await nn.predict({ inputs: [[1]] })
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.include('not implemented')
            }
        })
    })

    describe('loadOrCreate', () => {
        class FakeLoadable extends NeuralNetwork {
            static async create (config) { return new FakeLoadable(config) }
            static async load (config) {
                const err = new Error('not found')
                err.code = 'MODEL_NOT_FOUND'
                throw err
            }
        }

        class FakeLoaded extends NeuralNetwork {
            static async create (config) { throw new Error('should not call create') }
            static async load (config) { return new FakeLoaded(config) }
        }

        class FakeBroken extends NeuralNetwork {
            static async create (config) { throw new Error('should not call create') }
            static async load (config) {
                const err = new Error('disk failure')
                err.code = 'OTHER'
                throw err
            }
        }

        it('should fall back to create when load throws MODEL_NOT_FOUND', async () => {
            const nn = await FakeLoadable.loadOrCreate(baseConfig({ personalityName: 'fl1' }))
            expect(nn).to.be.instanceOf(FakeLoadable)
        })

        it('should return loaded instance when load succeeds', async () => {
            const nn = await FakeLoaded.loadOrCreate(baseConfig({ personalityName: 'fl2' }))
            expect(nn).to.be.instanceOf(FakeLoaded)
        })

        it('should re-throw non-MODEL_NOT_FOUND errors from load', async () => {
            try {
                await FakeBroken.loadOrCreate(baseConfig({ personalityName: 'fl3' }))
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.equal('disk failure')
            }
        })
    })
})
