import tf from '@tensorflow/tfjs-node'
import NeuralNetwork from './NeuralNetwork.js'
import fs from 'fs'
import path from 'path'

export default class TensorFlowNetwork extends NeuralNetwork {
    #model
    #dataPath
    #modelPath

    constructor (config) {
        super(config)
        this.#dataPath = path.join(this.trainingRootPath, 'tensorflow')
        fs.mkdirSync(this.#dataPath, { recursive: true })
        this.#modelPath = path.join(this.#dataPath, 'model.json')
    }

    static async create (config) {
        const nn = new TensorFlowNetwork(config)
        await nn.#create()
        await nn.#save(true)
        return nn
    }

    static async load (config) {
        const nn = new TensorFlowNetwork(config)
        await nn.#load()
        return nn
    }

    async save () {
        await this.#save(false)
    }

    async train (data) {
        const { inputs, labels } = data
        const { epochs = 10, batchSize = 32 } = this.personality.train
        const xs = tf.tensor2d(inputs)
        const ys = tf.tensor2d(labels, [labels.length, 1])

        try {
            const result = await this.#model.fit(xs, ys, {
                epochs,
                batchSize,
                shuffle: true
            })

            const lastEpoch = result.epoch.length - 1
            return {
                loss: result.history.loss[lastEpoch],
                accuracy: result.history.acc[lastEpoch]
            }
        } finally {
            xs.dispose()
            ys.dispose()
        }
    }

    async predict (data) {
        const { inputs } = data
        const xs = tf.tensor2d(inputs)

        try {
            const output = this.#model.predict(xs)
            const values = await output.data()
            output.dispose()
            return Array.from(values)
        } finally {
            xs.dispose()
        }
    }

    async #create () {
        const { learningRate = 0.001 } = this.personality.train
        const model = tf.sequential()

        for (const layer of this.arch.layers) {
            model.add(tf.layers[layer.type](layer))
        }

        model.compile({
            optimizer: tf.train.adam(learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        })

        this.#model = model
    }

    async #load () {
        if (!fs.existsSync(this.#modelPath)) {
            const err = new Error(`Model not found at ${this.#dataPath}`)
            err.code = 'MODEL_NOT_FOUND'
            throw err
        }
        this.#model = await tf.loadLayersModel(`file://${this.#modelPath}`)
        const { learningRate = 0.001 } = this.personality.train
        this.#model.compile({
            optimizer: tf.train.adam(learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        })
    }

    async #save (throwIfExists) {
        if (throwIfExists && fs.existsSync(this.#modelPath)) {
            throw new Error(`Model already exists at ${this.#dataPath}`)
        }
        await this.#model.save(`file://${this.#dataPath}`)
    }
}
