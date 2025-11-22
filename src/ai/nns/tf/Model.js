const fs = require('fs').promises
const path = require('path')

const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations

// Ensure custom layers are registered before loading/saving models
require('./AttentionLayer')
require('./SqueezeExcitationLayer')
require('./GatedResidualLayer')

const outputTransformations = require('../../common/outputTransformations')
const inferenceTransformations = require('../../common/inferenceTransformations')
const samplesFilters = require('../../common/samplesFilters')
const paths = require('../../common/paths')

class Model {
    #config /** @type {object} The config object */
    #arch /** @type {object} The architecture of the model */
    #model /** @type {tf.LayersModel} The TensorFlow model */
    #batch /** @type {Array<{input: tf.Tensor, output: tf.Tensor}>} */
    #summary = { runner: 'tf' } /** @type {object} The summary of the model */
    #trainSamplesFilterContext /** @type {object} Opaque context object for filter state */
    #trainSamplesFilter /** @type {function} The sample filter function */
    #trainOutputTransformation /** @type {function} The output transformation function */
    #inferenceOutputTransformation /** @type {function} The inference transformation function */
    #inputShape /** @type {number[]} The input shape [candlesWindowCount, featuresPerCandle] */
    #branchNames /** @type {string[]|null} Cached branch names for branched models */

    constructor (config) {
        this.#config = config
        this.#batch = []
        this.#trainSamplesFilterContext = {}
        this.#branchNames = null
    }

    static async create (config) {
        const model = new Model(config)
        await model.#init()
        return model
    }

    get summary () { return this.#summary }

    async #init () {
        this.#arch = JSON.parse(await fs.readFile(paths.modelArch(this.#config), 'utf-8'))
        if (this.#arch.branches) {
            this.#branchNames = Object.keys(this.#arch.branches)
                .filter(name => name !== 'shared')
        }
        this.#trainOutputTransformation = outputTransformations[this.#arch.training.outputTransformation]
        this.#inferenceOutputTransformation = inferenceTransformations[this.#arch.inference.inferenceTransformation]

        // Initialize sample filter
        const filterName = this.#arch.training.filtering || 'none'
        this.#trainSamplesFilter = samplesFilters[filterName]

        // Set up filter context with batch size
        this.#trainSamplesFilterContext.batchSize = this.#arch.training.batchSize

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
        // Apply sample filter with context
        if (!this.#trainSamplesFilter(this.#trainSamplesFilterContext, sample)) {
            return null
        }

        // Convert input to tensor with shape [candlesWindowCount, featuresPerCandle]
        // Note: Convert to Float32Array because TensorFlow.js Node doesn't recognize Float64Array
        const input = tf.tensor2d(new Float32Array(sample.rawInputs), this.#inputShape)

        // Transform outputs for training
        const transformedOutput = this.#trainOutputTransformation(sample)

        // For sequential/single-output models we expect a flat array of numbers.
        // For branched/multi-output models we expect an object keyed by branch name,
        // each value being an array of numbers (one label vector per branch).
        if (this.#arch.branches) {
            // Multi-output: keep outputs as an object keyed by branch
            this.#batch.push({ input, output: transformedOutput })
        } else {
            // Single-output: classic 1D label
            const output = tf.tensor1d(transformedOutput)
            this.#batch.push({ input, output })
        }

        // Check if batch is full
        if (this.#batch.length < this.#arch.training.batchSize) {
            return null
        }

        // Batch is full, train the model
        let inputs
        let outputs

        try {
            // Stack all inputs into a single tensor
            inputs = tf.stack(this.#batch.map(item => item.input))

            if (this.#arch.branches) {
                outputs = this.#branchNames.map(branchName => {
                    // For this branch, build a tensor per sample in the batch
                    const tensors = this.#batch.map(item => {
                        const label = item.output[branchName]
                        return tf.tensor1d(label)
                    })

                    // Stack into a single [batchSize, labelDim] tensor
                    const stacked = tf.stack(tensors)

                    // Dispose per-sample tensors now that they are stacked
                    tensors.forEach(t => t.dispose())

                    return stacked
                })
            } else {
                // Single-output case
                outputs = tf.stack(this.#batch.map(item => item.output))
            }

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
                if (!this.#arch.branches) {
                    // Single-output case: stored output is a tensor and must be disposed.
                    item.output.dispose?.()
                }
                // For branched models, item.output is a plain object with raw labels;
                // the per-branch tensors are created and disposed around stacking above.
            })

            inputs?.dispose()

            if (outputs) {
                if (this.#arch.branches && Array.isArray(outputs)) {
                    // Multi-output: outputs is an array of tensors
                    outputs.forEach(t => t.dispose())
                } else if (!this.#arch.branches) {
                    // Single-output: outputs is a single tensor
                    outputs.dispose()
                }
            }

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

            // Handle single-output and multi-output models
            if (Array.isArray(prediction)) {
                // Multi-output: prediction is an array of tensors
                const arrays = []
                for (const t of prediction) {
                    arrays.push(await t.array())
                    t.dispose()
                }

                const branchNames = this.#branchNames
                const predictionObj = {}

                branchNames.forEach((name, idx) => {
                    // arrays[idx] is [ [ ...values... ] ] because of batch dimension
                    predictionObj[name] = arrays[idx][0]
                })

                const actual = this.#trainOutputTransformation(sample)

                return {
                    prediction: predictionObj,
                    actual,
                    predictedClass: this.#inferenceOutputTransformation(predictionObj)
                }
            } else {
                // Single-output: prediction is a single tensor
                const predictionArray = await prediction.array()
                prediction.dispose()

                return {
                    prediction: predictionArray[0],
                    actual: this.#trainOutputTransformation(sample),
                    predictedClass: this.#inferenceOutputTransformation(predictionArray[0])
                }
            }
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
            case 'merge':
                // Currently we only support "concat"-style merge at the architecture level.
                // The present implementation does not model true multi-input merging inside
                // the shared trunk; instead, we treat "merge" as an identity operation.
                // This lets architectures that include a "merge" placeholder (e.g. after
                // multiple Conv1D blocks) compile and run, while effectively behaving as
                // a no-op. If/when we add true intra-trunk branching with multiple tensors,
                // this case can be extended to use tf.layers.concatenate() with multiple inputs.
                return tf.layers.activation({
                    activation: 'linear'
                })
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
                // Propagate isFirstLayer to the inner layer so that inputShape
                // (when needed) is applied to the wrapped RNN, not the wrapper.
                const innerLayer = this.#createLayer(layerConfig.layer, isFirstLayer)
                return tf.layers.bidirectional({
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
        const input = tf.input({ shape: this.#inputShape })
        let shared = input

        // 1. Shared trunk
        for (const layerConf of this.#arch.branches.shared) {
            shared = this.#applyLayerToTensor(shared, layerConf)
        }

        // 2. Branches
        const outputs = {}
        const outputNodes = []

        for (const branchName of Object.keys(this.#arch.branches)) {
            if (branchName === 'shared') continue

            let branchOut = shared
            for (const layerConf of this.#arch.branches[branchName]) {
                branchOut = this.#applyLayerToTensor(branchOut, layerConf)
            }

            outputs[branchName] = branchOut
            outputNodes.push(branchOut)
        }

        this.#model = tf.model({ inputs: input, outputs: outputNodes })
    }

    #applyLayerToTensor (tensor, conf) {
        const layer = this.#createLayer(conf, false)
        return layer.apply(tensor)
    }

    #compileModel () {
        const optimizer = this.#createOptimizer(this.#arch.compilation.optimizer)

        // Allow both single-output and multi-output loss specifications.
        // For branched models, if loss is given as an object keyed by branch name
        // (e.g., { classification: 'categoricalCrossentropy', regression: 'meanSquaredError' }),
        // we convert it into an array ordered by the branch definition order, excluding "shared".
        let lossConfig = this.#arch.compilation.loss

        if (this.#arch.branches &&
            lossConfig &&
            !Array.isArray(lossConfig) &&
            typeof lossConfig === 'object') {
            lossConfig = this.#branchNames.map(name => lossConfig[name])
        }

        this.#model.compile({
            optimizer,
            loss: lossConfig,
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
