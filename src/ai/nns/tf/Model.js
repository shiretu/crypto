const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations
const paths = require('../../common/paths')
const fs = require('fs').promises
const path = require('path')
const outputTransformations = require('../../common/outputTransformations')

class Model {
    #config /** @type {object} The config object */
    #arch /** @type {object} The architecture of the model */
    #model /** @type {tf.LayersModel} The TensorFlow model */
    #batch /** @type {Array<{input: tf.Tensor, output: tf.Tensor}>} */
    #summary = { runner: 'tf' } /** @type {object} The summary of the model */
    #outputTransformation /** @type {function} The output transformation function */
    #inputShape /** @type {number[]} The input shape [candlesWindowCount, featuresPerCandle] */

    constructor (config) {
        this.#config = config
        this.#batch = []
    }

    static async create (config) {
        const model = new Model(config)
        await model.#init()
        return model
    }

    get summary () { return this.#summary }

    async #init () {
        this.#arch = JSON.parse(await fs.readFile(paths.modelArch(this.#config), 'utf-8'))
        this.#outputTransformation = outputTransformations[this.#arch.output.transformation]
        this.#inputShape = [
            this.#config.samplesMetadata.inputs.length / this.#config.samplesMetadata.inputs.stride,
            this.#config.samplesMetadata.inputs.stride
        ]
        const savedModelPath = path.resolve(paths.modelRunnerFolder(this.#config), 'model.json')
        const stats = await fs.stat(savedModelPath).catch(() => null)
        if (stats) {
            await this.#loadModel(savedModelPath)
        } else {
            this.#createModel()
        }
        this.#compileModel()

        // Capture model summary
        const summaryLines = []
        this.#model.summary(null, null, (line) => summaryLines.push(line))
        this.#summary.initModel = summaryLines.join('\n')
    }

    async train (sample) {
        // Convert input to tensor with shape [candlesWindowCount, featuresPerCandle]
        // Note: Convert to Float32Array because TensorFlow.js Node doesn't recognize Float64Array
        const input = tf.tensor2d(new Float32Array(sample.rawInputs), this.#inputShape)

        // Transform and convert output to tensor
        const transformedOutput = this.#outputTransformation(sample)
        const output = tf.tensor1d(transformedOutput)

        // Add to batch
        this.#batch.push({ input, output })

        // Check if batch is full
        if (this.#batch.length < this.#arch.training.batchSize) {
            return null
        }

        // Batch is full, train the model
        let inputs, outputs
        try {
            // Stack all inputs and outputs into single tensors
            inputs = tf.stack(this.#batch.map(item => item.input))
            outputs = tf.stack(this.#batch.map(item => item.output))

            // Train on the batch
            const history = await this.#model.fit(inputs, outputs, {
                epochs: this.#arch.training.epochs,
                verbose: 0
            })

            // Return training metrics (arrays with one value per epoch)
            return history.history
        } finally {
            // Clean up tensors to prevent memory leaks
            this.#batch.forEach(item => {
                item.input.dispose()
                item.output.dispose()
            })
            inputs?.dispose()
            outputs?.dispose()
            this.#batch = []
        }
    }

    async inference (sample) {
        // Convert input to tensor with shape [1, candlesWindowCount, featuresPerCandle]
        // Note: Convert to Float32Array because TensorFlow.js Node doesn't recognize Float64Array
        const input = tf.tensor3d(new Float32Array(sample.rawInputs), [1, ...this.#inputShape])

        try {
            // Run prediction
            const prediction = this.#model.predict(input)

            // Convert tensor to array
            const predictionArray = await prediction.array()

            // Clean up
            prediction.dispose()

            // Return the first (and only) prediction
            return predictionArray[0]
        } finally {
            input.dispose()
        }
    }

    async save () {
        const destFolder = paths.modelRunnerFolder(this.#config)
        await fs.mkdir(destFolder, { recursive: true })
        const saveUrl = `file://${destFolder}`
        await this.#model.save(saveUrl)
        console.log(`Model saved to ${destFolder}`)
    }

    #createModel () {
        if (this.#arch.branches) {
            this.#createBranchedModel()
        } else {
            this.#createSequentialModel()
        }
    }

    #createSequentialModel () {
        const model = tf.sequential()

        for (let i = 0; i < this.#arch.layers.length; i++) {
            model.add(this.#createLayer(this.#arch.layers[i], i === 0))
        }

        this.#model = model
    }

    #createLayer (layerConfig, isFirstLayer) {
        const baseConfig = isFirstLayer ? { inputShape: this.#inputShape } : {}

        switch (layerConfig.type) {
            case 'lstm':
                return tf.layers.lstm({
                    ...baseConfig,
                    units: layerConfig.units,
                    returnSequences: layerConfig.returnSequences,
                    activation: layerConfig.activation,
                    recurrentActivation: layerConfig.recurrentActivation,
                    dropout: layerConfig.dropout,
                    recurrentDropout: layerConfig.recurrentDropout
                })

            case 'dropout':
                return tf.layers.dropout({
                    rate: layerConfig.rate
                })

            case 'flatten':
                return tf.layers.flatten(baseConfig)

            case 'dense':
                return tf.layers.dense({
                    units: layerConfig.units,
                    activation: layerConfig.activation,
                    kernelInitializer: layerConfig.kernelInitializer
                })

            case 'batchNormalization':
                return tf.layers.batchNormalization()

            case 'activation':
                return tf.layers.activation({
                    activation: layerConfig.activation
                })

            case 'conv1d':
                return tf.layers.conv1d({
                    ...baseConfig,
                    filters: layerConfig.filters,
                    kernelSize: layerConfig.kernelSize,
                    strides: layerConfig.strides,
                    padding: layerConfig.padding,
                    activation: layerConfig.activation,
                    dilationRate: layerConfig.dilation || 1
                })

            case 'maxPooling1d':
                return tf.layers.maxPooling1d({
                    poolSize: layerConfig.poolSize,
                    strides: layerConfig.strides,
                    padding: layerConfig.padding
                })

            case 'globalAveragePooling1d':
                return tf.layers.globalAveragePooling1d()

            case 'bidirectional': {
                const innerLayer = this.#createLayer(layerConfig.layer, false)
                return tf.layers.bidirectional({
                    ...baseConfig,
                    layer: innerLayer,
                    mergeMode: 'concat'
                })
            }

            case 'attention': {
                const AttentionLayer = require('./AttentionLayer')
                return new AttentionLayer()
            }

            case 'squeezeExcitation': {
                const SqueezeExcitationLayer = require('./SqueezeExcitationLayer')
                return new SqueezeExcitationLayer({
                    reduction: layerConfig.reduction || 16
                })
            }

            case 'gatedResidual': {
                const GatedResidualLayer = require('./GatedResidualLayer')
                return new GatedResidualLayer({
                    filters: layerConfig.filters,
                    kernelSize: layerConfig.kernelSize || 3,
                    activation: layerConfig.activation || 'relu'
                })
            }

            default:
                throw new Error(`Unknown layer type: ${layerConfig.type}`)
        }
    }

    #createBranchedModel () {
        throw new Error('Not implemented yet')
    }

    #compileModel () {
        const optimizer = this.#createOptimizer(this.#arch.compilation.optimizer)
        this.#model.compile({
            optimizer,
            loss: this.#arch.compilation.loss,
            metrics: this.#arch.compilation.metrics
        })
    }

    #createOptimizer (optimizerConf) {
        switch (optimizerConf.type) {
            case 'adam': {
                return tf.train.adam(
                    optimizerConf.learningRate,
                    optimizerConf.beta1,
                    optimizerConf.beta2,
                    optimizerConf.epsilon,
                    null, // decay
                    optimizerConf.clipNorm // clipNorm
                )
            }

            default:
                throw new Error(`Unknown optimizer type: ${optimizerConf.type}`)
        }
    }

    async #loadModel (modelPath) {
        const loadUrl = 'file://' + modelPath
        this.#model = await tf.loadLayersModel(loadUrl)
        console.log(`Model loaded from ${modelPath}`)
    }
}

module.exports = Model
