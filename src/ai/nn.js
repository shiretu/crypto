const path = require('path')
const fs = require('fs').promises
const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations

class NN {
    static #modelsRootFolder = path.resolve(path.join(__dirname, '..', '..', 'models'))
    static #optimizers = require(path.join(NN.#modelsRootFolder, 'optimizers.json'))
    #config
    #modelRootFolder /** @type {string} */
    #architecturePath /** @type {string} */
    #modelTfFolder /** @type {string} */
    #modelTfPath /** @type {string} */
    #architecture /** @type {object} */
    #model /** @type {tf.LayersModel} */
    #samplesCounter = 0 /** @type {number} */
    #lastSavedSamplesCount = 0 /** @type {number} */
    constructor (config) {
        this.#config = config
        this.#modelRootFolder = path.join(NN.#modelsRootFolder, this.#config.modelName)
        this.#architecturePath = path.join(this.#modelRootFolder, 'architecture.json')
        this.#modelTfFolder = path.join(this.#modelRootFolder, 'tf')
        this.#modelTfPath = path.join(this.#modelTfFolder, 'model.json')
    }

    static async create (config) {
        const result = new NN(config)
        await result.#init()
        return result
    }

    async train (samples) {
        this.#samplesCounter += samples.length
        const inputs = tf.tensor2d(samples.map(sample => this.#makeFlat(sample.inputs)))
        const outputs = tf.tensor2d(samples.map(sample => [sample.outputs.buyProfitPercent, sample.outputs.sellProfitPercent]))
        try {
            const history = await this.#model.fit(inputs, outputs, {
                epochs: this.#config.epochs,
                batchSize: samples.length,
                verbose: 0
            })
            if (this.#config.autosave) {
                const samplesSinceLastSave = this.#samplesCounter - this.#lastSavedSamplesCount
                if (samplesSinceLastSave >= this.#config.autosave) {
                    // console.log(`🔄 Autosaving model after ${this.#samplesCounter} samples (${samplesSinceLastSave} since last save)...`)
                    await this.#saveModel()
                    this.#lastSavedSamplesCount = this.#samplesCounter
                    // console.log(`✅ Model saved to ${this.#modelTfPath}`)
                }
            }
            return history
        } catch (err) {
            console.error(`Error during training: ${err}`)
            throw err
        } finally {
            inputs.dispose()
            outputs.dispose()
        }
    }

    getInfo () {
        if (!this.#model) {
            throw new Error('Model not initialized')
        }

        // Get model layer information
        const layers = this.#model.layers.map((layer, index) => ({
            index,
            name: layer.name,
            className: layer.getClassName(),
            inputShape: layer.inputSpec ? layer.inputSpec.map(spec => spec.shape) : null,
            outputShape: layer.outputShape,
            trainableParams: layer.countParams(),
            trainable: layer.trainable
        }))

        // Calculate total trainable vs non-trainable parameters
        const trainableParams = this.#model.layers.reduce((sum, layer) =>
            sum + (layer.trainable ? layer.countParams() : 0), 0)
        const nonTrainableParams = this.#model.countParams() - trainableParams

        // Get optimizer state
        const optimizer = this.#model.optimizer
        let iterations = 0
        try {
            if (optimizer && optimizer.iterations && typeof optimizer.iterations.dataSync === 'function') {
                iterations = optimizer.iterations.dataSync()[0]
            }
        } catch (error) {
            // Fallback if dataSync doesn't work
            iterations = 'N/A'
        }

        const optimizerInfo = {
            className: optimizer ? optimizer.getClassName() : 'Not compiled',
            learningRate: optimizer && optimizer.learningRate ? optimizer.learningRate : null,
            iterations,
            config: this.#architecture.optimizer
        }

        return {
            timestamp: new Date().toISOString(),

            // Model architecture details
            model: {
                name: this.#config.modelName,
                totalParams: this.#model.countParams(),
                trainableParams,
                nonTrainableParams,
                layerCount: this.#model.layers.length,
                compiled: !!this.#model.optimizer,
                inputShape: [this.#architecture.inputs_count],
                outputShape: [this.#architecture.outputs_count],
                layers
            },

            // Architecture metadata
            architecture: {
                inputs_count: this.#architecture.inputs_count,
                outputs_count: this.#architecture.outputs_count,
                loss: this.#architecture.loss,
                metrics: this.#architecture.metrics,
                layerTypes: this.#architecture.layers.map(l => l.type),
                activationFunctions: this.#architecture.layers
                    .filter(l => l.activation)
                    .map(l => l.activation)
            },

            // Optimizer information
            optimizer: optimizerInfo,

            // Configuration
            config: this.#config,

            // Training statistics
            training: {
                totalSamples: this.#samplesCounter,
                lastSavedAt: this.#lastSavedSamplesCount,
                samplesSinceLastSave: this.#samplesCounter - this.#lastSavedSamplesCount,
                autosaveEnabled: !!this.#config.autosave,
                autosaveInterval: this.#config.autosave || 'disabled'
            },

            // File paths
            paths: {
                modelRoot: this.#modelRootFolder,
                architecture: this.#architecturePath,
                modelTf: this.#modelTfPath,
                modelTfFolder: this.#modelTfFolder
            },

            // Memory usage (approximate)
            memory: {
                modelSize: `${(this.#model.countParams() * 4 / 1024 / 1024).toFixed(2)} MB`,
                parametersCount: this.#model.countParams(),
                bytesPerParameter: 4 // Float32
            }
        }
    }

    async #init () {
        this.#loadArchitecture()
        try {
            this.#model = await tf.loadLayersModel(`file://${this.#modelTfPath}`)
            console.log(`Model loaded from ${this.#modelTfPath}`)
        } catch (err) {
            console.log(`Failed to load model from ${this.#modelTfPath}: ${err}. Creating a new one.`)
            this.#createModel()
            await this.#saveModel()
        }
        await this.#compileModel()
    }

    #createModel () {
        const layerFactory = {
            dense: (config, isFirstLayer) => {
                const layerConfig = {
                    units: config.units,
                    activation: config.activation
                }

                // Add input shape for first layer
                if (isFirstLayer) {
                    layerConfig.inputShape = [this.#architecture.inputs_count]
                }

                // Add name if specified
                if (config.name) {
                    layerConfig.name = config.name
                }

                return tf.layers.dense(layerConfig)
            },
            dropout: (config) => tf.layers.dropout({ rate: config.rate })
        }

        this.#model = tf.sequential({
            layers: this.#architecture.layers.map((layerConfig, index) => {
                const factoryFunc = layerFactory[layerConfig.type]
                if (!factoryFunc) {
                    console.warn(`WARNING: Unknown layer type: ${layerConfig.type}, skipping`)
                    return null
                }
                return factoryFunc(layerConfig, index === 0)
            }).filter(layer => layer !== null)
        })
    }

    async #saveModel () {
        await fs.mkdir(this.#modelTfFolder, { recursive: true })
        await this.#model.save(`file://${this.#modelTfFolder}`)
    }

    #loadArchitecture () {
        this.#architecture = require(this.#architecturePath)
        const optimizerType = this.#architecture.optimizer.type

        if (!NN.#optimizers[optimizerType]) {
            throw new Error(`Unknown optimizer type: ${optimizerType}`)
        }

        // Start with defaults from optimizers.json
        const defaults = { ...NN.#optimizers[optimizerType] }

        // Merge any explicit parameters from architecture.json
        this.#architecture.optimizer = {
            type: optimizerType,
            ...defaults,
            ...this.#architecture.optimizer
        }
    }

    async #compileModel () {
        const optimizerConfig = this.#architecture.optimizer
        const optimizerFactory = {
            adam: (config) => tf.train.adam(
                config.learning_rate,
                config.beta1,
                config.beta2,
                config.epsilon
            ),
            sgd: (config) => tf.train.sgd(
                config.learning_rate,
                config.momentum
            ),
            rmsprop: (config) => tf.train.rmsprop(
                config.learning_rate,
                config.decay,
                config.momentum,
                config.epsilon
            ),
            adagrad: (config) => tf.train.adagrad(
                config.learning_rate,
                config.epsilon
            ),
            adadelta: (config) => tf.train.adadelta(
                config.learning_rate,
                config.rho,
                config.epsilon
            ),
            adamax: (config) => tf.train.adamax(
                config.learning_rate,
                config.beta1,
                config.beta2,
                config.epsilon,
                config.decay
            ),
            momentum: (config) => tf.train.momentum(
                config.learning_rate,
                config.momentum,
                config.use_nesterov
            )
        }

        this.#model.compile({
            optimizer: optimizerFactory[optimizerConfig.type](optimizerConfig),
            loss: this.#architecture.loss,
            metrics: this.#architecture.metrics
        })
    }

    #makeFlat (features) {
        return [
            // Candles: 9 arrays × 120 = 1080 features
            ...features.candles.opens,
            ...features.candles.highs,
            ...features.candles.lows,
            ...features.candles.closes,
            ...features.candles.volumes,
            ...features.candles.timestamps,
            ...features.candles.colors,
            ...features.candles.bodySizes,
            ...features.candles.tradesCount,

            // Studies: 837 features total
            ...features.studies.macdShort, // 120
            ...features.studies.macdLong, // 120
            ...features.studies.macdLine, // 120
            ...features.studies.macdSignal, // 120
            ...features.studies.macdHistogram, // 120
            ...features.studies.unused1, // 119
            ...features.studies.unused2, // 118

            // Patterns: 237 features
            ...features.patterns.single, // 119
            ...features.patterns.sliding, // 118

            // Global: 6 features
            features.global.candleDuration,
            features.global.windowSize,
            features.global.grossProfitTarget,
            features.global.grossStopLoss,
            features.global.positionSize,
            features.global.fees
        ]
    }
}

module.exports = NN
