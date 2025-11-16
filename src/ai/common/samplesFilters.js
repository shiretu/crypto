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

/**
 * Balance by signal strength (6 classes) to equal representation (~16.67% each) globally
 * Classifies samples by BOTH operation type AND signal quality:
 * - BUY_STRONG: buy confidence > 0.5 (successful, fast)
 * - BUY_WEAK: buy confidence -0.5 to 0.5 (uncertain, slow, or didn't enter)
 * - BUY_FAILED: buy confidence < -0.5 (failed badly, fast stop-loss)
 * - SELL_STRONG: sell confidence > 0.5 (successful, fast)
 * - SELL_WEAK: sell confidence -0.5 to 0.5 (uncertain, slow, or didn't enter)
 * - SELL_FAILED: sell confidence < -0.5 (failed badly, fast stop-loss)
 *
 * This ensures the model learns from all types of outcomes:
 * - What strong signals look like (positive outcomes)
 * - What weak/noisy signals look like (uncertain outcomes)
 * - What failed signals look like (negative outcomes)
 *
 * @param {object} context - Context object to store state
 * @param {Sample} sample - The sample to evaluate
 * @returns {boolean} True to accept, false to skip
 */
const balanceBySignalStrength = (context, sample) => {
    const buyConfidence = sample.outputs[0].confidence
    const sellConfidence = sample.outputs[1].confidence

    // Classify buy signal strength
    let buyClass
    if (buyConfidence > 0.5) {
        buyClass = 0 // BUY_STRONG
    } else if (buyConfidence < -0.5) {
        buyClass = 1 // BUY_FAILED
    } else {
        buyClass = 2 // BUY_WEAK
    }

    // Classify sell signal strength
    let sellClass
    if (sellConfidence > 0.5) {
        sellClass = 3 // SELL_STRONG
    } else if (sellConfidence < -0.5) {
        sellClass = 4 // SELL_FAILED
    } else {
        sellClass = 5 // SELL_WEAK
    }

    // Pick the class with stronger absolute confidence
    const sampleClass = Math.abs(buyConfidence) >= Math.abs(sellConfidence) ? buyClass : sellClass

    if (!context.classCounts) {
        context.classCounts = [0, 0, 0, 0, 0, 0] // [buy_strong, buy_failed, buy_weak, sell_strong, sell_failed, sell_weak]
        context.classCounts[sampleClass]++
        context.totalSamples = 1
        return true
    }

    // Calculate current percentage for this class
    const currentPercentage = context.classCounts[sampleClass] / context.totalSamples

    // Target is 16.67% for each of 6 classes
    const targetPercentage = 1 / 6
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
    balanceBuySellHold,
    balanceBySignalStrength
}
