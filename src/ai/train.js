/**
 * Real-time Trading Network Training Server
 * Accepts training datasets via WebSocket and performs incremental training
 */

const WebSocket = require('ws')
const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations
const fs = require('fs').promises
const path = require('path')

class TradingTrainingServer {
    #port = 8080 /** @type {number} */
    #model = null /** @type {tf.LayersModel} */
    #wss = null /** @type {WebSocket.Server} */
    #trainingStats = {
        totalSamples: 0,
        lastLoss: null,
        trainingStarted: null,
        lastUpdate: null
    } /** @type {{totalSamples:number,lastLoss:number|null,trainingStarted:Date|null,lastUpdate:Date|null}} */

    #config = {
        learningRate: 0.001,
        batchSize: 32,
        epochs: 1, // Single epoch per dataset for real-time training
        validationSplit: 0.0, // No validation split for streaming
        modelName: 'myFirstModel',
        debug: false // Debug flag for training stats logging
    } /** @type {{learningRate:number,batchSize:number,epochs:number,validationSplit:number,modelName:string,debug:boolean}} */

    #modelRootPath = path.resolve(path.join(__dirname, '..', 'models', this.#config.modelName)) /** @type {string} */
    #architecturePath = path.join(this.#modelRootPath, 'architecture.json') /** @type {string} */
    #optimizersPath = path.resolve(path.join(__dirname, '..', 'models', 'optimizers.json')) /** @type {string} */
    #tfModelFolder = path.join(this.#modelRootPath, 'tf') /** @type {string} */
    #tfModelPath = path.join(this.#tfModelFolder, 'model.json') /** @type {string} */
    #optimizers = require(this.#optimizersPath) /** @type {any} */
    #architecture = require(this.#architecturePath) /** @type {any} */

    /**
     * Create a new instance of the TradingTrainingServer
     * @param {object} options - Configuration options
     * @param {boolean} options.debug - Enable debug logging
     * @returns {Promise<TradingTrainingServer>}
     */
    static async create (options = {}) {
        const result = new TradingTrainingServer()
        if (options.debug) {
            result.#config.debug = true
        }
        await result.#initialize()
        return result
    }

    async #initialize () {
        await this.#loadOrCreateModel()
        this.#startWebSocketServer()
    }

    async #loadOrCreateModel () {
        try {
            // Merge optimizer defaults with explicit parameters
            this.#mergeOptimizerDefaults()

            this.#model = await tf.loadLayersModel(`file://${this.#tfModelPath}`)
        } catch (error) {
            this.#model = this.#createModel()
        }
        this.#compileModel()
        console.log(`Model with ${this.#model.countParams()} parameters activated`)
    }

    #mergeOptimizerDefaults () {
        const optimizerType = this.#architecture.optimizer.type

        if (!this.#optimizers[optimizerType]) {
            throw new Error(`Unknown optimizer type: ${optimizerType}`)
        }

        // Start with defaults from optimizers.json
        const defaults = { ...this.#optimizers[optimizerType] }

        // Merge any explicit parameters from architecture.json
        this.#architecture.optimizer = {
            type: optimizerType,
            ...defaults,
            ...this.#architecture.optimizer
        }

        if (this.#config.debug) {
            console.log('[DEBUG] Merged optimizer config:', this.#architecture.optimizer)
        }
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
                    layerConfig.inputShape = [this.#architecture.input_features]
                }

                // Add name if specified
                if (config.name) {
                    layerConfig.name = config.name
                }

                return tf.layers.dense(layerConfig)
            },
            dropout: (config) => tf.layers.dropout({ rate: config.rate })
        }

        return tf.sequential({
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

    #compileModel () {
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

    #startWebSocketServer () {
        this.#wss = new WebSocket.Server({ port: this.#port })
        this.#wss.on('connection', (ws) => {
            ws.on('message', async (data) => {
                try {
                    await this.#handleRequest(JSON.parse(data.toString()), (error, result) => {
                        if (error) {
                            ws.send(JSON.stringify({ type: 'error', message: error.message }))
                        } else {
                            ws.send(JSON.stringify(result))
                        }
                    })
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }))
                }
            })
        })
        console.log(`Training server running on port ${this.#port}`)
    }

    async #handleRequest (message, callback) {
        try {
            switch (message.type) {
                case 'train':
                    await this.#train(message.samples, callback)
                    break

                case 'save':
                    await this.#saveModel(callback)
                    break

                case 'predict':
                    await this.#makePrediction(message.features, callback)
                    break

                case 'stats':
                    callback(null, this.#getStats())
                    break

                default:
                    callback(new Error(`Unknown message type: ${message.type}`))
            }
        } catch (error) {
            callback(error)
        }
    }

    async #train (samples, callback) {
        const { features, labels } = this.#prepareTensors(samples)
        const startTime = Date.now()

        try {
            const history = await this.#model.fit(features, labels, {
                epochs: this.#config.epochs,
                batchSize: samples.length,
                verbose: 0
            })

            // Update stats
            this.#updateTrainingStats(samples.length, history.history.loss[0])

            // Debug logging if enabled
            if (this.#config.debug) {
                console.log(`[DEBUG] Training completed: ${samples.length} samples, loss: ${history.history.loss[0].toFixed(6)}, mae: ${history.history.mae[0].toFixed(6)}, total: ${this.#trainingStats.totalSamples}`)
            }

            // Training completed
            const duration = Date.now() - startTime

            callback(null, {
                type: 'training_completed',
                samples: samples.length,
                loss: history.history.loss[0],
                mae: history.history.mae[0],
                duration,
                totalSamples: this.#trainingStats.totalSamples
            })
        } catch (error) {
            callback(error)
        } finally {
            features.dispose()
            labels.dispose()
        }
    }

    #makeFlat (features) {
        return [
            // Candles: 8 arrays × 120 = 960 features
            ...features.candles.opens,
            ...features.candles.highs,
            ...features.candles.lows,
            ...features.candles.closes,
            ...features.candles.volumes,
            ...features.candles.timestamps,
            ...features.candles.colors,
            ...features.candles.bodySizes,

            // Studies: 7 arrays × 120 = 840 features
            ...features.studies.sma9,
            ...features.studies.sma12,
            ...features.studies.sma21,
            ...features.studies.ema9,
            ...features.studies.ema12,
            ...features.studies.ema21,
            ...features.studies.rsi14,

            // Patterns: 237 features
            ...features.patterns.single,
            ...features.patterns.sliding,

            // Global: 6 features
            features.global.candleDuration,
            features.global.windowSize,
            features.global.grossProfitTarget,
            features.global.grossStopLoss,
            features.global.positionSize,
            features.global.fees
        ]
    }

    #prepareTensors (samples) {
        const features = samples.map(sample => this.#makeFlat(sample.features))
        const labels = samples.map(sample => [sample.outcomes.grossBuy, sample.outcomes.grossSell])

        return {
            features: tf.tensor2d(features),
            labels: tf.tensor2d(labels)
        }
    }

    #updateTrainingStats (samples, loss) {
        this.#trainingStats.totalSamples += samples
        this.#trainingStats.lastLoss = loss
        this.#trainingStats.lastUpdate = new Date().toISOString()

        if (!this.#trainingStats.trainingStarted) {
            this.#trainingStats.trainingStarted = new Date().toISOString()
        }
    }

    async #saveModel (callback) {
        try {
            await fs.mkdir(this.#tfModelFolder, { recursive: true })
            await this.#model.save(`file://${this.#tfModelFolder}`)
            callback(null, { type: 'model_saved', path: this.#tfModelFolder })
        } catch (error) {
            callback(error)
        }
    }

    async #makePrediction (features, callback) {
        // Handle both nested object and flat array formats
        let flatFeatures
        if (Array.isArray(features)) {
            if (features.length !== 2043) {
                callback(new Error('Features array must have exactly 2043 values'))
                return
            }
            flatFeatures = features
        } else if (typeof features === 'object') {
            flatFeatures = this.#makeFlat(features)
            if (flatFeatures.length !== 2043) {
                callback(new Error('Features object must flatten to exactly 2043 values'))
                return
            }
        } else {
            callback(new Error('Features must be an array or nested object'))
            return
        }

        const input = tf.tensor2d([flatFeatures])
        const prediction = this.#model.predict(input)
        try {
            const result = await prediction.data()
            return {
                type: 'prediction',
                grossBuy: result[0],
                grossSell: result[1],
                decision: result[0] > result[1] ? 'BUY' : (result[1] > result[0] ? 'SELL' : 'HOLD'),
                confidence: Math.abs(result[0] - result[1])
            }
        } catch (error) {
            callback(error)
            return
        } finally {
            input.dispose()
            prediction.dispose()
        }
    }

    #getStats (ws) {
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
            iterations
        }

        // Calculate training efficiency metrics
        const trainingEfficiency = this.#trainingStats.totalSamples > 0
            ? {
                samplesPerSecond: this.#trainingStats.lastUpdate
                    ? this.#trainingStats.totalSamples / ((new Date(this.#trainingStats.lastUpdate) - new Date(this.#trainingStats.trainingStarted)) / 1000)
                    : 0,
                avgLoss: this.#trainingStats.lastLoss,
                isLearning: this.#trainingStats.totalSamples > 1, // Basic check if we have multiple samples
                lossImprovement: 'N/A' // Could track this with loss history
            }
            : null

        return {
            type: 'stats',
            timestamp: new Date().toISOString(),

            // Basic training stats
            training: this.#trainingStats,

            // Model architecture details
            model: {
                totalParams: this.#model.countParams(),
                trainableParams,
                nonTrainableParams,
                layerCount: this.#model.layers.length,
                compiled: !!this.#model.optimizer,
                layers
            },

            // Optimizer information
            optimizer: optimizerInfo,

            // Training efficiency
            efficiency: trainingEfficiency,

            // Configuration
            config: this.#config,

            // Architecture metadata
            architecture: {
                name: this.#architecture?.name || 'Unknown',
                inputFeatures: this.#architecture?.input_features || 0,
                outputFeatures: this.#architecture?.output_features || 0
            }
        }
    }
}

// Export for testing
module.exports = TradingTrainingServer

// Start server if run directly
if (require.main === module) {
    const main = async () => {
        process.on('SIGINT', () => {
            console.log('\nShutting down training server...')
            process.exit(0)
        })

        // Check for --debug flag in command line arguments
        const debug = process.argv.includes('--debug')
        if (debug) {
            console.log('[DEBUG] Debug mode enabled - training stats will be logged')
        }

        await (TradingTrainingServer.create({ debug }).catch(console.error))
    }
    main()
}
