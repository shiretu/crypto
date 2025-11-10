const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations
const path = require('path')
const fs = require('fs').promises
const Csv = require('../utils/Csv')

class Tf {
    #config /** @type {object} */
    #model /** @type {tf.LayersModel} */
    #batch /** @type {Array<{input: tf.Tensor, output: tf.Tensor}>} */
    #logTrain /** @type {function(Object):void} */

    constructor (config) {
        this.#config = config
        this.#batch = []
        this.#config.modelRunFolder = path.resolve(this.#config.modelFolder, 'tf', `${this.#config.candlesPerWindow}x${this.#config.featuresPerCandle}`)
        if (this.#config.logTrainEnabled) {
            const csv = new Csv(path.resolve(this.#config.modelRunFolder, 'train.csv'), true)
            this.#logTrain = (data) => {
                csv.print(data)
            }
        } else {
            this.#logTrain = (data) => {}
        }
    }

    static async load (config) {
        const result = new Tf(config)
        await result.#init()
        return result
    }

    async save () {
        await fs.mkdir(this.#config.modelRunFolder, { recursive: true })
        await this.#model.save(`file://${this.#config.modelRunFolder}`, { includeOptimizer: true })
        console.log(`Saved model to ${this.#config.modelRunFolder}`)
    }

    async train (inputArrays, outputArray) {
        // Convert input and output to tensors
        const input = tf.tensor(inputArrays)
        const output = tf.tensor(outputArray)

        // Add to batch
        this.#batch.push({ input, output })

        // Check if batch is full
        if (this.#batch.length < this.#config.modelArch.training.batchSize) { return null }

        // Stack all inputs and outputs into batched tensors
        const allInputs = tf.stack(this.#batch.map(item => item.input))
        const allOutputs = tf.stack(this.#batch.map(item => item.output))

        try {
            // Train on the batch
            const history = await this.#model.fit(allInputs, allOutputs, {
                epochs: 1,
                verbose: 0
            })

            // do the logging
            this.#logTrain({ outputArray, ...history.history })

            // Return training metrics
            return history.history
        } finally {
            // Clean up tensors
            this.#batch.forEach(item => {
                item.input.dispose()
                item.output.dispose()
            })
            allInputs.dispose()
            allOutputs.dispose()

            // Clear batch
            this.#batch = []
        }
    }

    pred (input) {
        throw new Error('TensorFlow model prediction not implemented')
    }

    async #init () {
        try {
            await this.#load()
        } catch {
            await this.#create()
        }
    }

    async #load () {
        const modelPath = `file://${this.#config.modelRunFolder}/model.json`
        this.#model = await tf.loadLayersModel(modelPath)
        console.log(`Loaded model from ${this.#config.modelRunFolder}`)
        this.#model.summary()
    }

    async #create () {
        // Add all configured layers
        const layers = this.#config.modelArch.layers.map((layer, index) => this.#createLayer(layer, index === 0)).filter(layer => layer !== null)

        // Create sequential model
        const model = tf.sequential({ layers })

        // Compile model
        const optimizer = this.#createOptimizer(this.#config.modelArch.compilation.optimizer)
        model.compile({
            optimizer,
            loss: this.#config.modelArch.compilation.loss,
            metrics: this.#config.modelArch.compilation.metrics
        })

        console.log('Model created successfully')
        model.summary()
        this.#model = model
        await this.save()
    }

    #createLayer (layerConf, isFirstLayer) {
        const baseConfig = isFirstLayer ? { inputShape: [this.#config.candlesPerWindow, this.#config.featuresPerCandle] } : {}

        switch (layerConf.type) {
            case 'lstm':
                return tf.layers.lstm({
                    ...baseConfig,
                    units: layerConf.units,
                    returnSequences: layerConf.returnSequences,
                    activation: layerConf.activation,
                    recurrentActivation: layerConf.recurrentActivation,
                    dropout: layerConf.dropout,
                    recurrentDropout: layerConf.recurrentDropout
                })

            case 'dropout':
                return tf.layers.dropout({
                    rate: layerConf.rate
                })

            case 'dense':
                return tf.layers.dense({
                    units: layerConf.units,
                    activation: layerConf.activation
                })

            case 'conv1d':
                return tf.layers.conv1d({
                    ...baseConfig,
                    filters: layerConf.filters,
                    kernelSize: layerConf.kernelSize,
                    strides: layerConf.strides,
                    padding: layerConf.padding,
                    activation: layerConf.activation
                })

            case 'maxPooling1d':
                return tf.layers.maxPooling1d({
                    poolSize: layerConf.poolSize,
                    strides: layerConf.strides,
                    padding: layerConf.padding
                })

            case 'globalAveragePooling1d':
                return tf.layers.globalAveragePooling1d()

            default:
                console.warn(`Unknown layer type: ${layerConf.type}`)
                return null
        }
    }

    #createOptimizer (optimizerConf) {
        switch (optimizerConf.type) {
            case 'adam':
                return tf.train.adam(
                    optimizerConf.learningRate,
                    optimizerConf.beta1,
                    optimizerConf.beta2,
                    optimizerConf.epsilon
                )

            default:
                console.warn(`Unknown optimizer type: ${optimizerConf.type}, using adam`)
                return tf.train.adam()
        }
    }
}

module.exports = {
    load: async (config) => { return await Tf.load(config) }
}
