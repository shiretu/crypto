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
    },

    /**
     * Hybrid decision rule for two-head models (classification + regression).
     *
     * The primary decision signal is the classification head (3-way: BUY/SELL/HOLD).
     * This helper is intentionally conservative and focuses on classification confidence.
     *
     * Supported input shapes:
     * - Flat array of 3 numbers: [p_buy, p_sell, p_hold]
     * - Flat array of 5 numbers: [p_buy, p_sell, p_hold, r_buy, r_sell]
     * - Tuple [classification, regression]
     *   where classification is an array of 3 probabilities and regression is ignored here.
     * - Object { classification: [...], regression: [...] }
     *
     * The rule is:
     * 1. Extract the 3-way classification distribution.
     * 2. Apply minimumSeparation with a moderate threshold.
     * 3. If extraction fails, fall back to argmax on whatever we have.
     *
     * @param {any} prediction - Raw model output for a single sample.
     * @returns {number} Predicted class index (0=BUY, 1=SELL, 2=HOLD)
     */
    hybridDecisionRule: (prediction) => {
        const { minimumSeparation, argmax } = module.exports

        // Helper: try to extract a 3-way classification distribution
        const extractClassification = (p) => {
            if (!p) {
                return null
            }

            // Case 1: flat array of length 3 or 5
            if (Array.isArray(p)) {
                if (p.length === 3) {
                    return p
                }
                if (p.length >= 5) {
                    return p.slice(0, 3)
                }
            }

            // Case 2: tuple [classification, regression]
            if (Array.isArray(p[0]) && Array.isArray(p[1])) {
                return p[0]
            }

            // Case 3: object with named heads
            if (typeof p === 'object' && !Array.isArray(p)) {
                if (Array.isArray(p.classification)) {
                    return p.classification
                }
                if (Array.isArray(p.head0)) {
                    return p.head0
                }
            }

            return null
        }

        const cls = extractClassification(prediction)

        // If we managed to extract a proper classification distribution, use a
        // separation-based rule to be slightly more conservative than argmax.
        if (cls && cls.length === 3) {
            // 5 percentage points separation is a mild requirement; tune as needed.
            return minimumSeparation(cls, 5)
        }

        // Fallback: best effort argmax on whatever we got.
        if (Array.isArray(prediction)) {
            return argmax(prediction)
        }

        // Last resort: HOLD
        return 2
    }
}
