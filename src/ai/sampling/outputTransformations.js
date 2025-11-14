module.exports = {
    // Takes full sample and converts confidence to winner-takes-all classification
    // Returns one-hot encoded array where the strongest confidence signal gets 1, rest get 0
    // Having access to the full sample allows future transformations to use input features
    confidenceSingleLabel: (sample) => {
        // Extract confidence values from each output
        const confidences = sample.outputs.map(output => output.confidence)

        const threshold = 0.5
        const normalized = confidences.map(v => Math.abs(v) >= threshold ? Math.abs(v) : 0)
        const max = Math.max(...normalized)

        // If all values below threshold, return all zeros
        if (max === 0) return confidences.map(() => 0)

        // Find the index with max confidence and make it 1, rest 0
        const maxIndex = normalized.findIndex(v => v === max)
        return normalized.map((_, i) => i === maxIndex ? 1 : 0)
    },

    // Takes full sample and converts confidence to multi-label classification
    // Each output independently becomes 1 if confidence >= threshold, else 0
    // Having access to the full sample allows future transformations to use input features
    confidenceMultiLabel: (sample) => {
        const confidences = sample.outputs.map(output => output.confidence)
        const threshold = 0.5
        return confidences.map(v => Math.abs(v) >= threshold ? 1 : 0)
    }
}
