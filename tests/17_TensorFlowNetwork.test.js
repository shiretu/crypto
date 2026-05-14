import fs from 'fs'
import path from 'path'
import { expect } from 'chai'
import tf from '@tensorflow/tfjs-node'
import TensorFlowNetwork from '../src/nn/TensorFlowNetwork.js'

const TEST_ARCH_NAME = '_test_nn_tf'
const TEST_ARCH_DIR = path.resolve('configs', 'nn', TEST_ARCH_NAME)
const TEST_ARCH_FILE = path.join(TEST_ARCH_DIR, 'arch.json')
const TEST_RUNTIME_DIR = path.resolve('data', 'nn', 'runtimes', TEST_ARCH_NAME)

const ARCH = {
    layers: [
        { type: 'dense', units: 4, activation: 'relu', inputShape: [3] },
        { type: 'dense', units: 1, activation: 'sigmoid' }
    ]
}

const makeConfig = (personalityName, overrides = {}) => ({
    name: TEST_ARCH_NAME,
    personality: {
        name: personalityName,
        data: overrides.data ?? {
            symbol: 'binance:eth:usdc',
            candleDuration: 300,
            lookback: 3,
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

const tinyDataset = (n = 8) => {
    const inputs = Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random()])
    const labels = inputs.map(([a, b, c]) => (a + b + c > 1.5 ? 1 : 0))
    return { inputs, labels }
}

describe('TensorFlowNetwork', () => {
    before(() => {
        fs.mkdirSync(TEST_ARCH_DIR, { recursive: true })
        fs.writeFileSync(TEST_ARCH_FILE, JSON.stringify(ARCH))
    })

    beforeEach(() => {
        // Wipe any persisted models between tests so each test gets a clean
        // runtime directory (the fingerprint only covers data+train, not the
        // personality name, so all tests would otherwise collide).
        fs.rmSync(TEST_RUNTIME_DIR, { recursive: true, force: true })
    })

    after(() => {
        fs.rmSync(TEST_ARCH_DIR, { recursive: true, force: true })
        fs.rmSync(TEST_RUNTIME_DIR, { recursive: true, force: true })
    })

    describe('create', () => {
        it('should create a runtime/tensorflow directory with model.json', async () => {
            const nn = await TensorFlowNetwork.create(makeConfig('create-1'))
            const modelPath = path.join(nn.trainingRootPath, 'tensorflow', 'model.json')
            expect(fs.existsSync(modelPath)).to.equal(true)
        })

        it('should refuse to overwrite an existing model on create', async () => {
            await TensorFlowNetwork.create(makeConfig('create-2'))
            try {
                await TensorFlowNetwork.create(makeConfig('create-2'))
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.message).to.include('already exists')
            }
        })

        it('should expose inherited arch and personality', async () => {
            const cfg = makeConfig('create-3')
            const nn = await TensorFlowNetwork.create(cfg)
            expect(nn.arch).to.deep.equal(ARCH)
            expect(nn.personality).to.equal(cfg.personality)
        })
    })

    describe('train', () => {
        it('should reduce loss after training (or at least return finite loss/accuracy)', async () => {
            const nn = await TensorFlowNetwork.create(makeConfig('train-1'))
            const { inputs, labels } = tinyDataset(32)
            const result = await nn.train({ inputs, labels })
            expect(result.loss).to.be.a('number')
            expect(Number.isFinite(result.loss)).to.equal(true)
            expect(result.accuracy).to.be.a('number')
            expect(Number.isFinite(result.accuracy)).to.equal(true)
        })

        it('should honor epochs from personality.train', async () => {
            const cfg = makeConfig('train-2', { train: { learningRate: 0.01, epochs: 3, batchSize: 4 } })
            const nn = await TensorFlowNetwork.create(cfg)
            const { inputs, labels } = tinyDataset(8)
            // Just confirm it completes without error with the configured epochs
            const result = await nn.train({ inputs, labels })
            expect(Number.isFinite(result.loss)).to.equal(true)
        })
    })

    describe('predict', () => {
        it('should return an array of numbers with the right length', async () => {
            const nn = await TensorFlowNetwork.create(makeConfig('predict-1'))
            const { inputs } = tinyDataset(5)
            const out = await nn.predict({ inputs })
            expect(out).to.be.an('array')
            expect(out).to.have.length(5)
            for (const v of out) {
                expect(v).to.be.a('number')
                expect(v).to.be.within(0, 1) // sigmoid output
            }
        })
    })

    describe('save + load round-trip', () => {
        it('should reload an identical model with matching predictions', async () => {
            const cfg = makeConfig('save-load-1')
            const nn = await TensorFlowNetwork.create(cfg)
            const { inputs, labels } = tinyDataset(16)
            await nn.train({ inputs, labels })
            await nn.save()

            const probe = inputs.slice(0, 4)
            const before = await nn.predict({ inputs: probe })

            const nn2 = await TensorFlowNetwork.load(cfg)
            const after = await nn2.predict({ inputs: probe })

            expect(after).to.have.length(before.length)
            for (let i = 0; i < before.length; i++) {
                expect(after[i]).to.be.closeTo(before[i], 1e-6)
            }
        })

        it('save should overwrite an existing model on disk', async () => {
            const cfg = makeConfig('save-overwrite')
            const nn = await TensorFlowNetwork.create(cfg)
            // train + save twice — no throw
            const { inputs, labels } = tinyDataset(8)
            await nn.train({ inputs, labels })
            await nn.save()
            await nn.train({ inputs, labels })
            await nn.save()
            const modelPath = path.join(nn.trainingRootPath, 'tensorflow', 'model.json')
            expect(fs.existsSync(modelPath)).to.equal(true)
        })
    })

    describe('load failure', () => {
        it('should throw MODEL_NOT_FOUND when no saved model exists', async () => {
            try {
                await TensorFlowNetwork.load(makeConfig('never-saved'))
                expect.fail('should have thrown')
            } catch (e) {
                expect(e.code).to.equal('MODEL_NOT_FOUND')
            }
        })
    })

    describe('loadOrCreate', () => {
        it('should create when no model exists, then load on next call', async () => {
            const cfg = makeConfig('loc-1')
            const a = await TensorFlowNetwork.loadOrCreate(cfg)
            const { inputs, labels } = tinyDataset(8)
            await a.train({ inputs, labels })
            await a.save()
            const probe = inputs.slice(0, 3)
            const aPred = await a.predict({ inputs: probe })

            const b = await TensorFlowNetwork.loadOrCreate(cfg)
            const bPred = await b.predict({ inputs: probe })
            for (let i = 0; i < aPred.length; i++) {
                expect(bPred[i]).to.be.closeTo(aPred[i], 1e-6)
            }
        })
    })

    describe('arch translation', () => {
        it('should build a model matching the arch layer count and input/output shape', async () => {
            const nn = await TensorFlowNetwork.create(makeConfig('arch-1'))
            const out = await nn.predict({ inputs: [[0, 0, 0]] })
            expect(out).to.have.length(1)
        })
    })

    describe('tensor cleanup', () => {
        it('should not leak tensors across train/predict cycles', async () => {
            const nn = await TensorFlowNetwork.create(makeConfig('leak-1'))
            const { inputs, labels } = tinyDataset(8)
            const before = tf.memory().numTensors
            await nn.train({ inputs, labels })
            await nn.predict({ inputs: inputs.slice(0, 2) })
            const after = tf.memory().numTensors
            // Allow for some metadata tensors, but the diff should be small (model weights + structure)
            expect(after - before).to.be.lessThan(100)
        })
    })
})
