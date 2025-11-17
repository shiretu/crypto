/**
 * Inference transformations convert raw neural network outputs into actionable predictions.
 * These transformations interpret the NN's probability distributions and decide when
 * the model is confident enough to make a trade decision vs holding.
 *
 * All transformations take the prediction array (e.g., [p_buy, p_sell, p_hold]) and return
 * the predicted class index (0=BUY, 1=SELL, 2=HOLD) or the raw value for regression.
 */

module.exports = {
    /**
     * Identity - returns the raw predicted value unchanged.
     * For regression models that predict a continuous value (e.g., profit percentage).
     *
     * @param {number[]} prediction - Model output (e.g., [2.35])
     * @returns {number} The raw predicted value
     */
    identity: (prediction) => {
        return prediction[0]
    },

    /**
     * Simple argmax - picks the class with highest probability.
     * No confidence filtering - always returns a winner even if probabilities are close.
     * For binary models with single output: returns 1 if > 0.5, else 0
     *
     * @param {number[]} prediction - Probability distribution from NN (e.g., [0.4, 0.4, 0.2] or [0.7])
     * @returns {number} Predicted class index (0=BUY, 1=SELL, 2=HOLD) or binary (0/1)
     */
    argmax: (prediction) => {
        // Binary model: single output value
        if (prediction.length === 1) {
            return prediction[0] > 0.5 ? 1 : 0
        }
        // Multi-class: argmax
        return prediction.indexOf(Math.max(...prediction))
    },

    /**
     * Minimum separation - requires clear margin of victory.
     * If the top two probabilities are too close, returns HOLD (class 2) indicating uncertainty.
     * Otherwise returns the class with highest probability.
     *
     * This aligns with softmax semantics: confidence comes from separation between options,
     * not absolute probability values.
     *
     * @param {number[]} prediction - Probability distribution from NN (e.g., [0.42, 0.30, 0.28])
     * @param {number} minSeparation - Minimum percentage point difference required (default: 10)
     * @returns {number} Predicted class index (0=BUY, 1=SELL, 2=HOLD)
     *
     * @example
     * minimumSeparation([0.65, 0.25, 0.10], 10) // => 0 (BUY, clear winner with 40 point margin)
     * minimumSeparation([0.42, 0.40, 0.18], 10) // => 2 (HOLD, only 2 point margin)
     * minimumSeparation([0.33, 0.33, 0.34], 10) // => 2 (HOLD, near tie)
     */
    minimumSeparation: (prediction, minSeparation = 10) => {
        // Scale to integer percentages for comparison
        const scaled = prediction.map(v => Math.floor(v * 100))

        // Find top 2 values
        const sorted = [...scaled].sort((a, b) => b - a)
        const separation = sorted[0] - sorted[1]

        // If winner doesn't have clear margin, consider it uncertain → HOLD
        if (separation < minSeparation) {
            return 2 // HOLD
        }

        // Clear winner - return its index
        return scaled.indexOf(Math.max(...scaled))
    }
}
