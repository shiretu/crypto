const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations

class Tf {
    #config /** @type {object} */
    #model /** @type {tf.LayersModel} */

    constructor (config) {
        this.#config = config
    }

    static async load (config) {
        const result = new Tf(config)
        await result.#init()
        return result
    }

    train (samples) {
        throw new Error('TensorFlow model training not implemented')
    }

    pred (input) {
        throw new Error('TensorFlow model prediction not implemented')
    }

    async #init () {
        try {
            this.#load()
        } catch {
            this.#create()
        }
    }

    #load () { throw new Error('Not implemented yet') }

    #create () {
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
    }

    #createLayer (layerConf, isFirstLayer) {
        const baseConfig = isFirstLayer ? { inputShape: [this.#config.candlesPerWindow, this.#config.featuresPerCandle] } : {}

        switch (layerConf.type) {
            case 'lstm':
                return tf.layers.lstm({
                    ...baseConfig,
                    units: layerConf.units,
                    returnSequences: layerConf.return_sequences,
                    activation: layerConf.activation,
                    recurrentActivation: layerConf.recurrent_activation,
                    dropout: layerConf.dropout,
                    recurrentDropout: layerConf.recurrent_dropout
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
                    kernelSize: layerConf.kernel_size,
                    strides: layerConf.strides,
                    padding: layerConf.padding,
                    activation: layerConf.activation
                })

            case 'max_pooling1d':
                return tf.layers.maxPooling1d({
                    poolSize: layerConf.pool_size,
                    strides: layerConf.strides,
                    padding: layerConf.padding
                })

            case 'global_average_pooling1d':
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
                    optimizerConf.learning_rate,
                    optimizerConf.beta_1,
                    optimizerConf.beta_2,
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
