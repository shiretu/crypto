const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations
const path = require('path')
const fs = require('fs').promises
const Csv = require('../utils/Csv')
const AttentionLayer = require('./AttentionLayer')
const SqueezeExcitationLayer = require('./SqueezeExcitationLayer')
const GatedResidualLayer = require('./GatedResidualLayer')
const { outputTransformations } = require('./common')

class Tf {
    #config /** @type {object} */
    #model /** @type {tf.LayersModel} */
    #batch /** @type {Array<{input: tf.Tensor, output: tf.Tensor}>} */
    #logTrain /** @type {function(Object):void} */
    #batchCount /** @type {number} */
    #outputTransformation /** @type {function(Array):Array} */

    constructor (config) {
        this.#config = config
        this.#batch = []
        this.#batchCount = 0
        this.#config.modelRunFolder = path.resolve(this.#config.modelFolder, 'tf', `${this.#config.candlesPerWindow}x${this.#config.featuresPerCandle}`)
        if (this.#config.logTrainEnabled) {
            const csv = new Csv(path.resolve(this.#config.modelRunFolder, 'train.csv'), !this.#config.usePregeneratedSamples)
            this.#logTrain = (data) => {
                csv.print(data)
            }
        } else {
            this.#logTrain = (data) => {}
        }
        this.#outputTransformation = outputTransformations[this.#config.modelArch.output.transformation]
    }

    get outputTransformation () {
        return this.#outputTransformation
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
        const transformedOutput = this.#outputTransformation(outputArray)
        const output = tf.tensor(transformedOutput)

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
                batchSize: this.#batch.length,
                verbose: 0
            })
            this.#batchCount++

            // do the logging
            this.#logTrain({ outputArray, transformedOutput, ...history.history, batchIndex: this.#batchCount - 1 })

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

    setupForInference () {
        // CRITICAL: Manually disable dropout layers for inference
        // TensorFlow.js doesn't reliably disable dropout with training=false
        // Call this once before running predictions to avoid repeated layer filtering
        const dropoutLayers = this.#model.layers.filter(layer => layer.getClassName() === 'Dropout')
        dropoutLayers.forEach(layer => { layer.rate = 0 })
    }

    async predict (inputArray) {
        // Convert input to tensor with shape [1, candlesPerWindow, featuresPerCandle]
        const inputTensor = tf.tensor3d([inputArray])

        try {
            // Run prediction (dropout should already be disabled via setupForInference)
            const outputTensor = this.#model.predict(inputTensor)

            // Convert tensor to array
            const originalOutput = await outputTensor.array()

            // Clean up
            inputTensor.dispose()
            outputTensor.dispose()

            // done
            return {
                originalOutput: originalOutput[0],
                nominalOutput: this.#outputTransformation(originalOutput[0])
            }
        } catch (error) {
            inputTensor.dispose()
            throw error
        }
    }

    async #init () {
        try {
            await this.#load()
        } catch (error) {
            console.error('Failed to load model:', error)
            console.log('Creating new model instead...')
            await this.#create()
        }
    }

    async #load () {
        const modelPath = `file://${this.#config.modelRunFolder}/model.json`
        this.#model = await tf.loadLayersModel(modelPath)

        // Recompile the model for inference (ensures proper configuration)
        const optimizer = this.#createOptimizer(this.#config.modelArch.compilation.optimizer)
        this.#model.compile({
            optimizer,
            loss: this.#config.modelArch.compilation.loss,
            metrics: this.#config.modelArch.compilation.metrics
        })

        console.log(`Loaded model from ${this.#config.modelRunFolder}`)
        this.#model.summary()
    }

    async #create () {
        // Check if this is an ensemble (multi-branch) architecture
        if (this.#config.modelArch.branches) {
            await this.#createEnsemble()
        } else {
            await this.#createSequential()
        }
    }

    async #createSequential () {
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

    async #createEnsemble () {
        // Create input layer
        const input = tf.input({ shape: [this.#config.candlesPerWindow, this.#config.featuresPerCandle] })

        // Build each branch
        const branchOutputs = this.#config.modelArch.branches.map(branchConfig => {
            let x = input
            for (const layerConf of branchConfig.layers) {
                const layer = this.#createLayer(layerConf, false)
                if (layer) {
                    x = layer.apply(x)
                }
            }
            return x
        })

        // Concatenate branch outputs
        let merged = branchOutputs.length > 1
            ? tf.layers.concatenate().apply(branchOutputs)
            : branchOutputs[0]

        // Add fusion layers
        for (const layerConf of this.#config.modelArch.fusion) {
            const layer = this.#createLayer(layerConf, false)
            if (layer) {
                merged = layer.apply(merged)
            }
        }

        // Create functional model
        const model = tf.model({ inputs: input, outputs: merged })

        // Compile model
        const optimizer = this.#createOptimizer(this.#config.modelArch.compilation.optimizer)
        model.compile({
            optimizer,
            loss: this.#config.modelArch.compilation.loss,
            metrics: this.#config.modelArch.compilation.metrics
        })

        console.log('Ensemble model created successfully')
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

            case 'flatten':
                return tf.layers.flatten(baseConfig)

            case 'dense':
                return tf.layers.dense({
                    units: layerConf.units,
                    activation: layerConf.activation,
                    kernelInitializer: layerConf.kernelInitializer
                })

            case 'batchNormalization':
                return tf.layers.batchNormalization()

            case 'activation':
                return tf.layers.activation({
                    activation: layerConf.activation
                })

            case 'conv1d':
                return tf.layers.conv1d({
                    ...baseConfig,
                    filters: layerConf.filters,
                    kernelSize: layerConf.kernelSize,
                    strides: layerConf.strides,
                    padding: layerConf.padding,
                    activation: layerConf.activation,
                    dilationRate: layerConf.dilation || 1
                })

            case 'maxPooling1d':
                return tf.layers.maxPooling1d({
                    poolSize: layerConf.poolSize,
                    strides: layerConf.strides,
                    padding: layerConf.padding
                })

            case 'globalAveragePooling1d':
                return tf.layers.globalAveragePooling1d()

            case 'bidirectional': {
                // Create the inner LSTM layer
                const innerLayer = this.#createLayer(layerConf.layer, false)
                return tf.layers.bidirectional({
                    ...baseConfig,
                    layer: innerLayer,
                    mergeMode: 'concat' // Concatenate forward and backward outputs
                })
            }

            case 'attention': {
                // Simplified attention mechanism using time-distributed dense + softmax
                // This learns to weight the importance of each timestep
                // Note: Expects input shape [batch, timesteps, features]
                return new AttentionLayer()
            }

            case 'squeezeExcitation': {
                // Squeeze-and-Excitation block for channel-wise attention
                // Learns which feature channels are most important
                // Note: Expects input shape [batch, timesteps, channels]
                return new SqueezeExcitationLayer({
                    reduction: layerConf.reduction || 16
                })
            }

            case 'gatedResidual': {
                // Gated Residual Block with learned skip connection
                // Network learns whether to use transformation or skip it
                // Note: Expects input shape [batch, timesteps, channels]
                return new GatedResidualLayer({
                    filters: layerConf.filters,
                    kernelSize: layerConf.kernelSize || 3,
                    activation: layerConf.activation || 'relu'
                })
            }

            default:
                console.warn(`Unknown layer type: ${layerConf.type}`)
                return null
        }
    }

    #createOptimizer (optimizerConf) {
        switch (optimizerConf.type) {
            case 'adam': {
                const optimizer = tf.train.adam(
                    optimizerConf.learningRate,
                    optimizerConf.beta1,
                    optimizerConf.beta2,
                    optimizerConf.epsilon
                )

                // Apply gradient clipping if specified
                if (optimizerConf.clipNorm) {
                    return tf.train.adam(
                        optimizerConf.learningRate,
                        optimizerConf.beta1,
                        optimizerConf.beta2,
                        optimizerConf.epsilon,
                        null, // decay
                        optimizerConf.clipNorm // clipNorm
                    )
                }

                return optimizer
            }

            default:
                console.warn(`Unknown optimizer type: ${optimizerConf.type}, using adam`)
                return tf.train.adam()
        }
    }
}

module.exports = {
    load: async (config) => { return await Tf.load(config) }
}
