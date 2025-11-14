const tf = require('@tensorflow/tfjs')

/**
 * Gated Residual Block
 * Implements a residual connection with a learned gate
 *
 * Architecture:
 * 1. Process input through transformation layers
 * 2. Learn a gate value [0,1] via sigmoid
 * 3. Output = gate * transformed + (1 - gate) * input
 *
 * This allows the network to dynamically decide:
 * - gate ≈ 0: Skip the transformation (use identity)
 * - gate ≈ 1: Use the transformation fully
 * - gate ≈ 0.5: Blend both
 */
class GatedResidualLayer extends tf.layers.Layer {
    constructor (config) {
        super(config || {})
        this.filters = config.filters
        this.kernelSize = config.kernelSize || 3
        this.activation = config.activation || 'relu'
    }

    build (inputShape) {
        // inputShape: [batch, timesteps, channels]
        const inputChannels = inputShape[2]

        // Main transformation pathway
        this.conv1 = tf.layers.conv1d({
            filters: this.filters,
            kernelSize: this.kernelSize,
            padding: 'same',
            activation: this.activation,
            name: 'gated_conv1'
        })

        this.conv2 = tf.layers.conv1d({
            filters: this.filters,
            kernelSize: this.kernelSize,
            padding: 'same',
            activation: 'linear', // No activation before gating
            name: 'gated_conv2'
        })

        // Gate pathway - learns how much to use transformation
        this.gateConv = tf.layers.conv1d({
            filters: this.filters,
            kernelSize: 1, // 1x1 conv for gating
            padding: 'same',
            activation: 'sigmoid', // Output in [0, 1]
            name: 'gate_conv'
        })

        // Projection layer if input channels != output channels
        this.needsProjection = inputChannels !== this.filters
        if (this.needsProjection) {
            this.projection = tf.layers.conv1d({
                filters: this.filters,
                kernelSize: 1,
                padding: 'same',
                activation: 'linear',
                name: 'projection'
            })
            this.projection.build(inputShape)
            this._trainableWeights.push(...this.projection.trainableWeights)
        }

        // Build layers
        this.conv1.build(inputShape)
        this.conv2.build([inputShape[0], inputShape[1], this.filters])
        this.gateConv.build([inputShape[0], inputShape[1], this.filters])

        // Register trainable weights
        this._trainableWeights.push(...this.conv1.trainableWeights)
        this._trainableWeights.push(...this.conv2.trainableWeights)
        this._trainableWeights.push(...this.gateConv.trainableWeights)

        super.build(inputShape)
    }

    call (inputs) {
        return tf.tidy(() => {
            // inputs shape: [batch, timesteps, channels]
            const input = inputs[0] || inputs

            // Main transformation pathway
            let transformed = this.conv1.apply(input)
            transformed = this.conv2.apply(transformed)

            // Compute gate
            const gate = this.gateConv.apply(transformed)

            // Project input if needed
            const residual = this.needsProjection
                ? this.projection.apply(input)
                : input

            // Gated residual connection:
            // output = gate * transformed + (1 - gate) * residual
            const gatedTransformed = tf.mul(gate, transformed)
            const oneMinusGate = tf.sub(1, gate)
            const gatedResidual = tf.mul(oneMinusGate, residual)
            const output = tf.add(gatedTransformed, gatedResidual)

            return output
        })
    }

    computeOutputShape (inputShape) {
        // Output shape: [batch, timesteps, filters]
        return [inputShape[0], inputShape[1], this.filters]
    }

    getConfig () {
        const config = super.getConfig()
        return {
            ...config,
            filters: this.filters,
            kernelSize: this.kernelSize,
            activation: this.activation
        }
    }

    static get className () {
        return 'GatedResidualLayer'
    }
}

// Register the custom layer
tf.serialization.registerClass(GatedResidualLayer)

module.exports = GatedResidualLayer
