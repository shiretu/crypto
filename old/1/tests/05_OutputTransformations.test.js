/* eslint-env mocha */
const assert = require('assert')
const { outputTransformations } = require('../src/ai/common')

describe('Output Transformations', () => {
    describe('none - Pass-through transformation', () => {
        it('should return input unchanged', () => {
            assert.deepStrictEqual(outputTransformations.none([0.1, 0.9]), [0.1, 0.9])
            assert.deepStrictEqual(outputTransformations.none([0.5, 0.5]), [0.5, 0.5])
            assert.deepStrictEqual(outputTransformations.none([-0.3, 0.7]), [-0.3, 0.7])
        })

        it('should handle edge cases', () => {
            assert.deepStrictEqual(outputTransformations.none([0, 0]), [0, 0])
            assert.deepStrictEqual(outputTransformations.none([1, 1]), [1, 1])
            assert.deepStrictEqual(outputTransformations.none([-1, -1]), [-1, -1])
        })
    })

    describe('multiLabel - Independent thresholding', () => {
        it('should threshold each output independently at 0.5', () => {
            // Both below threshold
            assert.deepStrictEqual(outputTransformations.multiLabel([0.3, 0.4]), [0, 0])

            // First above, second below
            assert.deepStrictEqual(outputTransformations.multiLabel([0.7, 0.3]), [1, 0])

            // First below, second above
            assert.deepStrictEqual(outputTransformations.multiLabel([0.2, 0.8]), [0, 1])

            // Both above threshold
            assert.deepStrictEqual(outputTransformations.multiLabel([0.6, 0.7]), [1, 1])
        })

        it('should handle threshold boundary at 0.5', () => {
            // Exactly at threshold should be above (>= 0.5)
            assert.deepStrictEqual(outputTransformations.multiLabel([0.5, 0.5]), [1, 1])

            // Just below threshold
            assert.deepStrictEqual(outputTransformations.multiLabel([0.4999, 0.4999]), [0, 0])

            // Just above threshold
            assert.deepStrictEqual(outputTransformations.multiLabel([0.5001, 0.5001]), [1, 1])
        })

        it('should handle edge cases', () => {
            assert.deepStrictEqual(outputTransformations.multiLabel([0, 0]), [0, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([1, 1]), [1, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([0, 1]), [0, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([1, 0]), [1, 0])
        })

        it('should handle negative input values', () => {
            // Negative values are below threshold → [0, 0]
            assert.deepStrictEqual(outputTransformations.multiLabel([-0.5, -0.3]), [0, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([-0.8, -0.9]), [0, 0])

            // Mix of negative and positive
            assert.deepStrictEqual(outputTransformations.multiLabel([-0.2, 0.7]), [0, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.8, -0.1]), [1, 0])
        })

        it('should allow neutral [0,0] predictions', () => {
            // This is the key advantage over singleLabel
            assert.deepStrictEqual(outputTransformations.multiLabel([0.1, 0.2]), [0, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.3, 0.3]), [0, 0])
        })

        it('should allow both active [1,1] predictions', () => {
            // Both can be active simultaneously
            assert.deepStrictEqual(outputTransformations.multiLabel([0.9, 0.8]), [1, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.6, 0.6]), [1, 1])
        })
    })

    describe('singleLabel - Winner-takes-all', () => {
        it('should pick the winner when one is clearly above threshold', () => {
            // First wins
            assert.deepStrictEqual(outputTransformations.singleLabel([0.8, 0.2]), [1, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.9, 0.1]), [1, 0])

            // Second wins
            assert.deepStrictEqual(outputTransformations.singleLabel([0.2, 0.8]), [0, 1])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.1, 0.9]), [0, 1])
        })

        it('should pick winner based on max value when both above threshold', () => {
            // First is higher
            assert.deepStrictEqual(outputTransformations.singleLabel([0.7, 0.6]), [1, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.9, 0.8]), [1, 0])

            // Second is higher
            assert.deepStrictEqual(outputTransformations.singleLabel([0.6, 0.7]), [0, 1])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.8, 0.9]), [0, 1])
        })

        it('should return all zeros when all values below threshold', () => {
            // None above 0.5 threshold
            assert.deepStrictEqual(outputTransformations.singleLabel([0.3, 0.4]), [0, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.1, 0.2]), [0, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.49, 0.49]), [0, 0])
        })

        it('should handle threshold boundary at 0.5', () => {
            // Exactly at threshold counts as above
            assert.deepStrictEqual(outputTransformations.singleLabel([0.5, 0.4]), [1, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.4, 0.5]), [0, 1])

            // Both at threshold - first one wins (findIndex returns first match)
            assert.deepStrictEqual(outputTransformations.singleLabel([0.5, 0.5]), [1, 0])
        })

        it('should pick first when values are equal and above threshold', () => {
            // When equal, findIndex returns first match
            assert.deepStrictEqual(outputTransformations.singleLabel([0.7, 0.7]), [1, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.9, 0.9]), [1, 0])
        })

        it('should ensure mutually exclusive outputs', () => {
            // Only one can be 1 at a time (winner-takes-all)
            const result1 = outputTransformations.singleLabel([0.8, 0.2])
            assert.strictEqual(result1.filter(v => v === 1).length, 1)

            const result2 = outputTransformations.singleLabel([0.3, 0.7])
            assert.strictEqual(result2.filter(v => v === 1).length, 1)

            const result3 = outputTransformations.singleLabel([0.6, 0.6])
            assert.strictEqual(result3.filter(v => v === 1).length, 1)
        })

        it('should handle edge cases', () => {
            assert.deepStrictEqual(outputTransformations.singleLabel([0, 0]), [0, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([1, 0]), [1, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0, 1]), [0, 1])
            assert.deepStrictEqual(outputTransformations.singleLabel([1, 1]), [1, 0]) // First wins
        })

        it('should handle negative input values', () => {
            // Negative values are below threshold → [0, 0]
            assert.deepStrictEqual(outputTransformations.singleLabel([-0.5, -0.3]), [0, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([-0.8, -0.9]), [0, 0])

            // Mix of negative and positive - positive wins
            assert.deepStrictEqual(outputTransformations.singleLabel([-0.2, 0.7]), [0, 1])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.8, -0.1]), [1, 0])

            // Both positive - higher wins
            assert.deepStrictEqual(outputTransformations.singleLabel([0.6, 0.8]), [0, 1])
        })
    })

    describe('Comparison: singleLabel vs multiLabel', () => {
        it('singleLabel cannot output [0,0] when values above threshold', () => {
            // singleLabel forces a winner
            assert.deepStrictEqual(outputTransformations.singleLabel([0.6, 0.6]), [1, 0])

            // multiLabel allows both
            assert.deepStrictEqual(outputTransformations.multiLabel([0.6, 0.6]), [1, 1])
        })

        it('singleLabel cannot output [1,1] ever', () => {
            // singleLabel is mutually exclusive
            assert.deepStrictEqual(outputTransformations.singleLabel([0.9, 0.9]), [1, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([1, 1]), [1, 0])

            // multiLabel allows both active
            assert.deepStrictEqual(outputTransformations.multiLabel([0.9, 0.9]), [1, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([1, 1]), [1, 1])
        })

        it('both can output [0,0] when below threshold', () => {
            const input = [0.3, 0.4]
            assert.deepStrictEqual(outputTransformations.singleLabel(input), [0, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel(input), [0, 0])
        })

        it('both agree on clear winners when one is significantly higher', () => {
            // First clearly wins
            assert.deepStrictEqual(outputTransformations.singleLabel([0.9, 0.1]), [1, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.9, 0.1]), [1, 0])

            // Second clearly wins
            assert.deepStrictEqual(outputTransformations.singleLabel([0.1, 0.9]), [0, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.1, 0.9]), [0, 1])
        })
    })

    describe('Real-world scenarios', () => {
        it('should handle typical sigmoid outputs for neutral cases', () => {
            // Typical LSTM/CNN sigmoid outputs when uncertain
            assert.deepStrictEqual(outputTransformations.multiLabel([0.07, 0.06]), [0, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.14, 0.10]), [0, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.3, 0.3]), [0, 0])
        })

        it('should handle typical sigmoid outputs for buy signals', () => {
            assert.deepStrictEqual(outputTransformations.multiLabel([0.8, 0.2]), [1, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.7, 0.3]), [1, 0])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.65, 0.4]), [1, 0])
        })

        it('should handle typical sigmoid outputs for sell signals', () => {
            assert.deepStrictEqual(outputTransformations.multiLabel([0.2, 0.8]), [0, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.3, 0.7]), [0, 1])
            assert.deepStrictEqual(outputTransformations.multiLabel([0.4, 0.65]), [0, 1])
        })

        it('should handle typical softmax outputs', () => {
            // Softmax outputs sum to 1
            assert.deepStrictEqual(outputTransformations.singleLabel([0.3, 0.7]), [0, 1])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.7, 0.3]), [1, 0])
            assert.deepStrictEqual(outputTransformations.singleLabel([0.5, 0.5]), [1, 0]) // Tie, first wins
        })

        it('should handle collapsed model outputs', () => {
            // When model collapses to [0.5, 0.5]
            const collapsed = [0.5, 0.5]

            // singleLabel picks first (arbitrary)
            assert.deepStrictEqual(outputTransformations.singleLabel(collapsed), [1, 0])

            // multiLabel treats both as confident (at threshold)
            assert.deepStrictEqual(outputTransformations.multiLabel(collapsed), [1, 1])
        })
    })
})
