const tf = require('@tensorflow/tfjs')

/**
 * Squeeze-and-Excitation Block
 * Adaptively recalibrates channel-wise feature responses by modeling interdependencies between channels
 *
 * Architecture:
 * 1. Global Average Pooling (Squeeze): [batch, timesteps, channels] → [batch, channels]
 * 2. Dense (Excitation): [batch, channels] → [batch, channels/reduction] → [batch, channels]
 * 3. Sigmoid activation to get channel weights [0, 1]
 * 4. Scale: Multiply original input by learned channel weights
 */
class SqueezeExcitationLayer extends tf.layers.Layer {
    constructor (config) {
        super(config || {})
        this.reduction = config.reduction || 16
    }

    build (inputShape) {
        // inputShape: [batch, timesteps, channels]
        const channels = inputShape[2]
        const reducedChannels = Math.max(1, Math.floor(channels / this.reduction))

        // Excitation network: channels → reduced → channels
        this.dense1 = tf.layers.dense({
            units: reducedChannels,
            activation: 'relu',
            name: 'se_dense1'
        })

        this.dense2 = tf.layers.dense({
            units: channels,
            activation: 'sigmoid',
            name: 'se_dense2'
        })

        // Build the dense layers
        this.dense1.build([null, channels])
        this.dense2.build([null, reducedChannels])

        // Register trainable weights
        this._trainableWeights.push(...this.dense1.trainableWeights)
        this._trainableWeights.push(...this.dense2.trainableWeights)

        super.build(inputShape)
    }

    call (inputs) {
        return tf.tidy(() => {
            // inputs shape: [batch, timesteps, channels]
            const input = inputs[0] || inputs

            // Squeeze: Global average pooling across time dimension
            // [batch, timesteps, channels] → [batch, channels]
            const squeezed = tf.mean(input, 1)

            // Excitation: Learn channel-wise attention weights
            // [batch, channels] → [batch, reduced] → [batch, channels]
            let excited = this.dense1.apply(squeezed)
            excited = this.dense2.apply(excited)

            // Expand dimensions for broadcasting: [batch, channels] → [batch, 1, channels]
            const weights = tf.expandDims(excited, 1)

            // Scale: Multiply input by learned channel weights
            // [batch, timesteps, channels] × [batch, 1, channels] → [batch, timesteps, channels]
            const scaled = tf.mul(input, weights)

            return scaled
        })
    }

    computeOutputShape (inputShape) {
        // Output shape is same as input shape
        return inputShape
    }

    getConfig () {
        const config = super.getConfig()
        return {
            ...config,
            reduction: this.reduction
        }
    }

    static get className () {
        return 'SqueezeExcitationLayer'
    }
}

// Register the custom layer
tf.serialization.registerClass(SqueezeExcitationLayer)

module.exports = SqueezeExcitationLayer
