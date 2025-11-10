const tf = require('@tensorflow/tfjs')

/**
 * Custom Attention Layer
 * Learns to weight the importance of each timestep in the sequence
 */
class AttentionLayer extends tf.layers.Layer {
    constructor (config) {
        super(config || {})
    }

    build (inputShape) {
        // inputShape: [batch, timesteps, features]
        const timesteps = inputShape[1]
        const features = inputShape[2]

        // Create trainable dense layer to compute attention scores
        this.denseLayer = tf.layers.dense({
            units: 1,
            useBias: false,
            name: 'attention_dense'
        })

        // Build the dense layer with correct input shape
        this.denseLayer.build([null, timesteps, features])
        this._trainableWeights.push(...this.denseLayer.trainableWeights)

        super.build(inputShape)
    }

    call (inputs) {
        return tf.tidy(() => {
            // inputs shape: [batch, timesteps, features]
            const input = inputs[0] || inputs

            // Compute attention scores: [batch, timesteps, 1]
            const scores = this.denseLayer.apply(input)

            // Squeeze to [batch, timesteps] for softmax
            const scoresSqueezeX = tf.squeeze(scores, [2])

            // Apply softmax to get attention weights: [batch, timesteps]
            const attentionWeights = tf.softmax(scoresSqueezeX, -1)

            // Expand back to [batch, timesteps, 1] for broadcasting
            const attentionWeightsExpanded = tf.expandDims(attentionWeights, -1)

            // Apply attention weights: [batch, timesteps, features] * [batch, timesteps, 1]
            const weightedInput = tf.mul(input, attentionWeightsExpanded)

            // Sum across timesteps: [batch, features]
            const output = tf.sum(weightedInput, 1)

            return output
        })
    }

    computeOutputShape (inputShape) {
        // Output shape: [batch, features]
        return [inputShape[0], inputShape[2]]
    }

    getConfig () {
        const config = super.getConfig()
        return config
    }

    static get className () {
        return 'AttentionLayer'
    }
}

// Register the custom layer
tf.serialization.registerClass(AttentionLayer)

module.exports = AttentionLayer
