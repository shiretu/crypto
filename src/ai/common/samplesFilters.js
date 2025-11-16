/**
 * Sample filtering functions for training data selection.
 * Each filter receives a context object (for state) and sample, returns true to include, false to skip.
 * The context object is maintained by the model and passed to each filter call.
 */

/**
 * No filtering - accept all samples
 * @param {object} context - Opaque context object (unused for this filter)
 * @param {Sample} sample - The sample to evaluate
 * @returns {boolean} Always true
 */
const none = (context, sample) => {
    return true
}

/**
 * Balance buy/sell/hold classes to equal representation (33%/33%/33%) globally
 * Determines class directly from raw sample confidence values:
 * - BUY: buy confidence > 0.5 (positive and strong)
 * - SELL: sell confidence > 0.5 (positive and strong)
 * - HOLD: both confidences <= 0.5 (not confident enough to act)
 * Negative confidence means "don't do it", positive means "do it"
 * Maintains global counters to track cumulative class distribution
 * @param {object} context - Context object to store state
 * @param {Sample} sample - The sample to evaluate
 * @returns {boolean} True to accept, false to skip
 */
const balanceBuySellHold = (context, sample) => {
    // Get raw confidence values from sample outputs (can be negative or positive)
    const buyConfidence = sample.outputs[0].confidence
    const sellConfidence = sample.outputs[1].confidence

    // Determine class based on confidence threshold (0.5)
    // Only act if confidence is positive AND > 0.5
    let sampleClass
    if (buyConfidence > 0.5 && buyConfidence >= sellConfidence) {
        sampleClass = 0 // BUY
    } else if (sellConfidence > 0.5) {
        sampleClass = 1 // SELL
    } else {
        sampleClass = 2 // HOLD (neither confidence is > 0.5)
    }

    if (!context.classCounts) {
        context.classCounts = [0, 0, 0] // [buy, sell, hold]
        context.classCounts[sampleClass]++
        context.totalSamples = 1
        return true
    }

    // Calculate current percentage for this class
    const currentPercentage = context.classCounts[sampleClass] / context.totalSamples

    // Target is 33.33% for each class
    const targetPercentage = 1 / 3
    const drift = currentPercentage - targetPercentage

    // Skip if this class is over-represented by more than 5%
    if (drift > 0.05) {
        return false
    }

    // Accept sample and update global counts
    context.classCounts[sampleClass]++
    context.totalSamples++

    return true
}

module.exports = {
    none,
    balanceBuySellHold
}
