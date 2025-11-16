module.exports = {
    /**
     * Binary classification: [buy, sell] - winner takes all
     * Returns one-hot encoded array where the strongest POSITIVE confidence signal gets 1, rest get 0
     * Only considers positive confidence > 0.5 (strong, fast confirmation)
     * Negative confidence (intent failed) or weak positive (< 0.5) are ignored
     * @param {Sample} sample - The sample with outputs containing confidence values
     * @returns {number[]} One-hot encoded array [buy, sell]
     */
    confidenceTwoClass: (sample) => {
        const confidences = sample.outputs.map(output => output.confidence)
        const threshold = 0.5

        // Only consider positive confidence above threshold
        const normalized = confidences.map(v => v > threshold ? v : 0)
        const max = Math.max(...normalized)

        // If no strong positive signals, return all zeros
        if (max === 0) return confidences.map(() => 0)

        // Find the index with max confidence and make it 1, rest 0
        const maxIndex = normalized.findIndex(v => v === max)
        return normalized.map((_, i) => i === maxIndex ? 1 : 0)
    },

    /**
     * Three-class classification: [buy, sell, hold] - winner takes all
     * If no strong positive signals (confidence > 0.5) -> HOLD, otherwise -> strongest signal wins
     * Negative confidence (intent failed) or weak positive (≤ 0.5) result in HOLD
     * @param {Sample} sample - The sample with outputs containing confidence values
     * @returns {number[]} One-hot encoded array [buy, sell, hold]
     */
    confidenceThreeClass: (sample) => {
        const confidences = sample.outputs.map(output => output.confidence)
        const threshold = 0.5

        // Only consider positive confidence above threshold
        const normalized = confidences.map(v => v > threshold ? v : 0)
        const max = Math.max(...normalized)

        // If no strong positive signals -> HOLD (class 2)
        if (max === 0) return [0, 0, 1]

        // Find the index with max confidence
        const maxIndex = normalized.findIndex(v => v === max)
        // Return [buy, sell, hold] one-hot encoded
        return maxIndex === 0 ? [1, 0, 0] : [0, 1, 0]
    },

    /**
     * Regression: [buy_profit_percent, sell_profit_percent] - raw profit values
     * Returns the actual profit percentage for each operation
     * This is for regression training (predicting continuous values), not classification
     * @param {Sample} sample - The sample with outputs containing profitPercent values
     * @returns {number[]} Array of profit percentages [buy_profit_percent, sell_profit_percent]
     */
    profitPercent: (sample) => {
        return sample.outputs.map(output => output.profitPercent)
    }
}
