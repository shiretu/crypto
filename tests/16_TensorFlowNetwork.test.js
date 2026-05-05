import { expect } from 'chai'
import TensorFlowNetwork from '../src/nn/TensorFlowNetwork.js'
import NeuralNetwork from '../src/nn/NeuralNetwork.js'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('TensorFlowNetwork', () => {
    const nnDir = path.resolve('nn')
    const testName = 'testModel'
    const testPath = path.join(nnDir, testName)
    const config = { name: testName, train: { learningRate: 0.001 } }
    const arch = {
        layers: [
            { type: 'dense', units: 8, activation: 'relu', inputShape: [4] },
            { type: 'dense', units: 1, activation: 'sigmoid' }
        ]
    }

    beforeEach(() => {
        fs.mkdirSync(testPath, { recursive: true })
        fs.writeFileSync(path.join(testPath, 'arch.json'), JSON.stringify(arch, null, 2))
    })

    afterEach(() => {
        fs.rmSync(testPath, { recursive: true, force: true })
    })

    it('should extend NeuralNetwork', async () => {
        const nn = await TensorFlowNetwork.create(config)
        expect(nn).to.be.instanceOf(NeuralNetwork)
    })

    it('should create a model from arch.json and save it', async () => {
        const nn = await TensorFlowNetwork.create(config)
        expect(nn).to.be.instanceOf(TensorFlowNetwork)
        const tfPath = path.join(testPath, 'runtime', 'tensorflow')
        expect(fs.existsSync(path.join(tfPath, 'model.json'))).to.equal(true)
    })

    it('should predict after create', async () => {
        const nn = await TensorFlowNetwork.create(config)
        const results = await nn.predict({
            inputs: [[0.1, 0.2, 0.3, 0.4]]
        })
        expect(results).to.have.length(1)
        expect(results[0]).to.be.within(0, 1)
    })

    it('should train and return loss/accuracy', async () => {
        const nn = await TensorFlowNetwork.create(config)
        const result = await nn.train({
            inputs: [
                [0.1, 0.2, 0.3, 0.4],
                [0.5, 0.6, 0.7, 0.8],
                [0.9, 0.8, 0.7, 0.6],
                [0.2, 0.3, 0.4, 0.5]
            ],
            labels: [1, 0, 1, 0],
            epochs: 5
        })
        expect(result).to.have.property('loss')
        expect(result).to.have.property('accuracy')
        expect(result.loss).to.be.a('number')
        expect(result.accuracy).to.be.a('number')
    })

    it('should save and load a model', async () => {
        const nn = await TensorFlowNetwork.create(config)
        await nn.train({
            inputs: [[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]],
            labels: [1, 0],
            epochs: 1
        })
        await nn.save()

        const beforePred = await nn.predict({ inputs: [[0.1, 0.2, 0.3, 0.4]] })

        const nn2 = await TensorFlowNetwork.load(config)
        const afterPred = await nn2.predict({ inputs: [[0.1, 0.2, 0.3, 0.4]] })

        expect(afterPred[0]).to.be.closeTo(beforePred[0], 1e-5)
    })

    it('should throw MODEL_NOT_FOUND on missing model', async () => {
        try {
            await TensorFlowNetwork.load(config)
            expect.fail('should have thrown')
        } catch (err) {
            expect(err.code).to.equal('MODEL_NOT_FOUND')
        }
    })

    it('should loadOrCreate - create when not found', async () => {
        const nn = await TensorFlowNetwork.loadOrCreate(config)
        expect(nn).to.be.instanceOf(TensorFlowNetwork)
    })

    it('should batch predict multiple inputs', async () => {
        const nn = await TensorFlowNetwork.create(config)
        const results = await nn.predict({
            inputs: [
                [0.1, 0.2, 0.3, 0.4],
                [0.5, 0.6, 0.7, 0.8],
                [0.9, 0.8, 0.7, 0.6]
            ]
        })
        expect(results).to.have.length(3)
        results.forEach(v => expect(v).to.be.within(0, 1))
    })
})
