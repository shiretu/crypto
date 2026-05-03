const { expect } = require('chai')
const outputTransformations = require('../src/ai/common/outputTransformations')

describe('outputTransformations', () => {
    // Helper to create a sample with specific confidence values
    const createSample = (buyConfidence, sellConfidence) => ({
        outputs: [
            { confidence: buyConfidence },
            { confidence: sellConfidence }
        ]
    })

    describe('confidenceTwoClass', () => {
        it('should return [1, 0] for strong positive BUY signal', () => {
            const sample = createSample(0.8, 0.2)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([1, 0])
        })

        it('should return [0, 1] for strong positive SELL signal', () => {
            const sample = createSample(0.2, 0.9)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([0, 1])
        })

        it('should return [0, 0] when both signals are weak (positive but <= 0.5)', () => {
            const sample = createSample(0.3, 0.4)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([0, 0])
        })

        it('should return [0, 0] when both signals are negative', () => {
            const sample = createSample(-0.8, -0.6)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([0, 0])
        })

        it('should return [0, 0] when BUY is negative and SELL is weak positive', () => {
            const sample = createSample(-0.7, 0.3)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([0, 0])
        })

        it('should return [1, 0] when BUY is strong positive and SELL is negative', () => {
            const sample = createSample(0.8, -0.6)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([1, 0])
        })

        it('should return [0, 1] when SELL is strong positive and BUY is negative', () => {
            const sample = createSample(-0.5, 0.7)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([0, 1])
        })

        it('should pick strongest when both are above threshold', () => {
            const sample = createSample(0.6, 0.9)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([0, 1])
        })

        it('should handle exactly 0.5 threshold (should return [0, 0])', () => {
            const sample = createSample(0.5, 0.5)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([0, 0])
        })

        it('should handle values just above threshold', () => {
            const sample = createSample(0.51, 0.49)
            expect(outputTransformations.confidenceTwoClass(sample)).to.deep.equal([1, 0])
        })
    })

    describe('confidenceThreeClass', () => {
        it('should return [1, 0, 0] for strong positive BUY signal', () => {
            const sample = createSample(0.8, 0.2)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([1, 0, 0])
        })

        it('should return [0, 1, 0] for strong positive SELL signal', () => {
            const sample = createSample(0.2, 0.9)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 1, 0])
        })

        it('should return [0, 0, 1] (HOLD) when both signals are weak positive', () => {
            const sample = createSample(0.3, 0.4)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 0, 1])
        })

        it('should return [0, 0, 1] (HOLD) when both signals are negative', () => {
            const sample = createSample(-0.8, -0.6)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 0, 1])
        })

        it('should return [0, 0, 1] (HOLD) when BUY is negative and SELL is weak positive', () => {
            const sample = createSample(-0.7, 0.3)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 0, 1])
        })

        it('should return [1, 0, 0] when BUY is strong positive and SELL is negative', () => {
            const sample = createSample(0.8, -0.6)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([1, 0, 0])
        })

        it('should return [0, 1, 0] when SELL is strong positive and BUY is negative', () => {
            const sample = createSample(-0.5, 0.7)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 1, 0])
        })

        it('should pick strongest when both are above threshold', () => {
            const sample = createSample(0.6, 0.9)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 1, 0])
        })

        it('should return [0, 0, 1] (HOLD) when exactly at 0.5 threshold', () => {
            const sample = createSample(0.5, 0.5)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 0, 1])
        })

        it('should handle values just above threshold', () => {
            const sample = createSample(0.51, 0.49)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([1, 0, 0])
        })

        it('should return [0, 0, 1] (HOLD) for mixed weak/negative signals', () => {
            const sample = createSample(0.3, -0.2)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 0, 1])
        })
    })

    describe('confidence semantics understanding', () => {
        it('should understand that negative confidence means intent failed', () => {
            // BUY order went down (stop-loss hit quickly) -> negative confidence
            const sample = createSample(-0.9, 0.1)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 0, 1])
        })

        it('should understand that positive < 0.5 means too slow/weak', () => {
            // BUY order went up but took too long (timeRatio high) -> low positive confidence
            const sample = createSample(0.2, 0.1)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([0, 0, 1])
        })

        it('should understand that positive > 0.5 means strong, fast confirmation', () => {
            // BUY order hit take-profit quickly -> high positive confidence
            const sample = createSample(0.9, 0.1)
            expect(outputTransformations.confidenceThreeClass(sample)).to.deep.equal([1, 0, 0])
        })
    })

    describe('profitPercent (regression)', () => {
        // Helper to create a sample with specific profit percentages
        const createSampleWithProfit = (buyProfitPercent, sellProfitPercent) => ({
            outputs: [
                { confidence: 0.5, profitPercent: buyProfitPercent },
                { confidence: 0.5, profitPercent: sellProfitPercent }
            ]
        })

        it('should return raw profit percentages', () => {
            const sample = createSampleWithProfit(0.015, -0.008)
            expect(outputTransformations.profitPercent(sample)).to.deep.equal([0.015, -0.008])
        })

        it('should handle positive profits', () => {
            const sample = createSampleWithProfit(0.025, 0.032)
            expect(outputTransformations.profitPercent(sample)).to.deep.equal([0.025, 0.032])
        })

        it('should handle negative profits (losses)', () => {
            const sample = createSampleWithProfit(-0.012, -0.015)
            expect(outputTransformations.profitPercent(sample)).to.deep.equal([-0.012, -0.015])
        })

        it('should handle zero profits', () => {
            const sample = createSampleWithProfit(0, 0)
            expect(outputTransformations.profitPercent(sample)).to.deep.equal([0, 0])
        })

        it('should work independently of confidence values', () => {
            // Profit percent is independent of confidence
            const sample = {
                outputs: [
                    { confidence: -0.9, profitPercent: 0.02 },
                    { confidence: 0.8, profitPercent: -0.01 }
                ]
            }
            expect(outputTransformations.profitPercent(sample)).to.deep.equal([0.02, -0.01])
        })

        it('should handle large profit values', () => {
            const sample = createSampleWithProfit(0.15, 0.22)
            expect(outputTransformations.profitPercent(sample)).to.deep.equal([0.15, 0.22])
        })
    })
})
