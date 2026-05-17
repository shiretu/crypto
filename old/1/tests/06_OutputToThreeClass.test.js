const { outputToThreeClass } = require('../src/ai/common')
const assert = require('assert')

describe('outputToThreeClass', () => {
    describe('Neutral cases (weak signals)', () => {
        it('[0, 0] should be hold', () => {
            const result = outputToThreeClass([0, 0])
            assert.deepStrictEqual(result, [0, 0, 1])
        })

        it('[0.1, 0.1] should be hold (both weak)', () => {
            const result = outputToThreeClass([0.1, 0.1])
            assert(result[2] > result[0], 'Hold probability should be greater than buy')
            assert(result[2] > result[1], 'Hold probability should be greater than sell')
        })

        it('[0.2, -0.2] should be hold (mixed weak signals)', () => {
            const result = outputToThreeClass([0.2, -0.2])
            assert(result[2] > result[0], 'Hold probability should be greater than buy')
            assert(result[2] > result[1], 'Hold probability should be greater than sell')
        })

        it('[-0.15, 0.15] should be hold (small opposing signals)', () => {
            const result = outputToThreeClass([-0.15, 0.15])
            assert(result[2] > result[0], 'Hold probability should be greater than buy')
            assert(result[2] > result[1], 'Hold probability should be greater than sell')
        })
    })

    describe('Buy signals (negative buy, weak/negative sell)', () => {
        it('[-0.8, 0.5] should be buy (p_buy > p_sell, p_hold = 0)', () => {
            const result = outputToThreeClass([-0.8, 0.5])
            assert(result[0] > result[1], 'p_buy should be greater than p_sell')
            assert.strictEqual(result[2], 0, 'p_hold should be 0 for strong signals')
        })

        it('[-0.9, 0.8] should be buy (p_buy > p_sell)', () => {
            const result = outputToThreeClass([-0.9, 0.8])
            assert(result[0] > result[1], 'p_buy should be greater than p_sell')
            assert.strictEqual(result[2], 0, 'p_hold should be 0')
        })

        it('[-0.67, 0] should be buy with some hold probability', () => {
            const result = outputToThreeClass([-0.67, 0])
            assert(result[0] > 0.6, 'p_buy should be high')
            assert(result[2] > 0, 'p_hold should be > 0 when one signal is 0')
        })

        it('[-0.95, 0] should be buy (strong)', () => {
            const result = outputToThreeClass([-0.95, 0])
            assert(result[0] > 0.9, 'p_buy should be very high')
            assert.strictEqual(result[1], 0, 'p_sell should be 0')
        })

        it('[-0.5, -0.3] should favor buy (both negative, buy stronger)', () => {
            const result = outputToThreeClass([-0.5, -0.3])
            assert(result[0] > result[1], 'p_buy should be greater than p_sell')
            assert(result[2] > 0, 'p_hold should be > 0 when signals don\'t sum to 1')
        })
    })

    describe('Sell signals (weak/negative buy, positive sell)', () => {
        it('[0.6, -0.8] should be sell (p_sell > p_buy, p_hold = 0)', () => {
            const result = outputToThreeClass([0.6, -0.8])
            assert(result[1] > result[0], 'p_sell should be greater than p_buy')
            assert.strictEqual(result[2], 0, 'p_hold should be 0 for strong signals')
        })

        it('[0.88, -0.97] should be sell', () => {
            const result = outputToThreeClass([0.88, -0.97])
            assert(result[1] > result[0], 'p_sell should be greater than p_buy')
            assert.strictEqual(result[2], 0, 'p_hold should be 0')
        })

        it('[0.46, -0.68] should be sell', () => {
            const result = outputToThreeClass([0.46, -0.68])
            assert(result[1] > result[0], 'p_sell should be greater than p_buy')
            assert.strictEqual(result[2], 0, 'p_hold should be 0')
        })

        it('[0, -0.95] should be sell (strong)', () => {
            const result = outputToThreeClass([0, -0.95])
            assert(result[1] > 0.9, 'p_sell should be very high')
            assert.strictEqual(result[0], 0, 'p_buy should be 0')
        })

        it('[-0.3, -0.5] should favor sell (both negative, sell stronger)', () => {
            const result = outputToThreeClass([-0.3, -0.5])
            assert(result[1] > result[0], 'p_sell should be greater than p_buy')
            assert(result[2] > 0, 'p_hold should be > 0')
        })
    })

    describe('Probability properties', () => {
        it('Output should sum to 1', () => {
            const testCases = [
                [0, 0],
                [-0.8, 0.5],
                [0.6, -0.8],
                [0.2, 0.2],
                [-0.95, 0],
                [0, -0.95]
            ]

            testCases.forEach(input => {
                const result = outputToThreeClass(input)
                const sum = result.reduce((a, b) => a + b, 0)
                assert(Math.abs(sum - 1) < 0.00001, `Sum should be 1, got ${sum} for input ${input}`)
            })
        })

        it('All probabilities should be between 0 and 1', () => {
            const testCases = [
                [0, 0],
                [-0.8, 0.5],
                [0.6, -0.8],
                [-1, -1],
                [1, 1]
            ]

            testCases.forEach(input => {
                const result = outputToThreeClass(input)
                result.forEach(p => {
                    assert(p >= 0, `Probability should be >= 0, got ${p}`)
                    assert(p <= 1, `Probability should be <= 1, got ${p}`)
                })
            })
        })
    })

    describe('Edge cases', () => {
        it('Large opposing values should have equal probabilities', () => {
            const result = outputToThreeClass([5, -5])
            // Uses absolute values: |5| and |-5| are equal, so [0.5, 0.5, 0]
            assert(Math.abs(result[0] - result[1]) < 0.001, 'p_buy and p_sell should be equal')
            assert.strictEqual(result[2], 0, 'p_hold should be 0 for large signals')
        })

        it('Large opposing values (reversed) should have equal probabilities', () => {
            const result = outputToThreeClass([-5, 5])
            // Uses absolute values: |-5| and |5| are equal, so [0.5, 0.5, 0]
            assert(Math.abs(result[0] - result[1]) < 0.001, 'p_buy and p_sell should be equal')
            assert.strictEqual(result[2], 0, 'p_hold should be 0 for large signals')
        })

        it('Unequal large values should favor the larger absolute value', () => {
            const result = outputToThreeClass([3, -7])
            // |3| = 3, |-7| = 7, so sell should dominate
            assert(result[1] > result[0], 'p_sell should be greater than p_buy')
        })

        it('Very small values should be hold', () => {
            const result = outputToThreeClass([0.01, -0.01])
            assert(result[2] > result[0], 'Hold should dominate')
            assert(result[2] > result[1], 'Hold should dominate')
        })
    })

    describe('Real training examples', () => {
        it('Training sample: [0, -0.98] -> strong sell', () => {
            const result = outputToThreeClass([0, -0.98])
            assert(result[1] > 0.9, 'p_sell should be very high')
            assert.strictEqual(result[0], 0, 'p_buy should be 0')
        })

        it('Training sample: [-0.85, 0.79] -> buy favored', () => {
            const result = outputToThreeClass([-0.85, 0.79])
            assert(result[0] > result[1], 'p_buy should be greater than p_sell')
            assert.strictEqual(result[2], 0, 'p_hold should be 0 for strong signals')
        })

        it('Training sample: [-0.00, 0.00] -> hold', () => {
            const result = outputToThreeClass([-0.00, 0.00])
            assert.deepStrictEqual(result, [0, 0, 1])
        })

        it('Training sample: [-0.27, 0] -> hold (weak buy)', () => {
            const result = outputToThreeClass([-0.27, 0])
            assert(result[2] > result[0], 'Hold should dominate weak signals')
        })
    })
})
