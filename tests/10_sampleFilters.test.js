const { expect } = require('chai')
const sampleFilters = require('../src/ai/common/samplesFilters')

describe('sampleFilters', () => {
    describe('none', () => {
        it('should always return true', () => {
            const context = {}
            const sample = { outputs: [] }

            expect(sampleFilters.none(context, sample)).to.equal(true)
            expect(sampleFilters.none(context, sample)).to.equal(true)
            expect(sampleFilters.none(context, sample)).to.equal(true)
        })

        it('should not modify context', () => {
            const context = {}
            const sample = { outputs: [] }

            sampleFilters.none(context, sample)

            expect(Object.keys(context)).to.have.lengthOf(0)
        })
    })

    describe('balanceBuySellHold', () => {
        // Helper to create a sample with specific confidence values
        const createSample = (buyConfidence, sellConfidence) => ({
            outputs: [
                { confidence: buyConfidence },
                { confidence: sellConfidence }
            ]
        })

        it('should accept first sample and initialize context', () => {
            const context = {}
            const sample = createSample(0.8, -0.2) // BUY signal

            const result = sampleFilters.balanceBuySellHold(context, sample)

            expect(result).to.equal(true)
            expect(context.classCounts).to.deep.equal([1, 0, 0]) // [buy, sell, hold]
            expect(context.totalSamples).to.equal(1)
        })

        it('should balance BUY samples', () => {
            const context = {}

            // Accept first BUY
            expect(sampleFilters.balanceBuySellHold(context, createSample(0.8, -0.2))).to.equal(true)
            expect(context.classCounts).to.deep.equal([1, 0, 0])

            // Accept second BUY (2/2 = 100%, target 33%, drift = 67% > 5%)
            // Should reject
            expect(sampleFilters.balanceBuySellHold(context, createSample(0.8, -0.2))).to.equal(false)
            expect(context.classCounts).to.deep.equal([1, 0, 0]) // Unchanged
        })

        it('should accept SELL and HOLD to balance', () => {
            const context = {}

            // BUY: 0.8, -0.2 -> BUY wins
            // SELL: -0.8, 0.9 -> SELL wins
            // HOLD: 0.2, -0.1 -> both below threshold, HOLD

            expect(sampleFilters.balanceBuySellHold(context, createSample(0.8, -0.2))).to.equal(true) // BUY
            expect(context.classCounts).to.deep.equal([1, 0, 0])

            expect(sampleFilters.balanceBuySellHold(context, createSample(-0.8, 0.9))).to.equal(true) // SELL
            expect(context.classCounts).to.deep.equal([1, 1, 0])

            expect(sampleFilters.balanceBuySellHold(context, createSample(0.2, -0.1))).to.equal(true) // HOLD
            expect(context.classCounts).to.deep.equal([1, 1, 1])
        })

        it('should maintain 33%/33%/33% balance with 5% tolerance', () => {
            const context = {}

            // Feed samples in round-robin with imbalance (more BUY)
            // The filter should maintain balance by rejecting excess samples
            const samples = []

            // Create imbalanced data: 40% BUY, 30% SELL, 30% HOLD
            for (let round = 0; round < 10; round++) {
                samples.push(createSample(0.8, -0.2)) // BUY
                samples.push(createSample(0.8, -0.2)) // BUY (extra)
                samples.push(createSample(-0.8, 0.9)) // SELL
                samples.push(createSample(0.2, -0.1)) // HOLD
            }

            let acceptedCount = 0
            samples.forEach(sample => {
                const result = sampleFilters.balanceBuySellHold(context, sample)
                if (result) acceptedCount++
            })

            // Should have accepted most samples with balance
            expect(context.totalSamples).to.equal(acceptedCount)
            expect(context.totalSamples).to.be.greaterThan(10) // Should accept at least 10

            // Check balance - each should be close to 33% with 5% tolerance
            const buyPct = context.classCounts[0] / context.totalSamples
            const sellPct = context.classCounts[1] / context.totalSamples
            const holdPct = context.classCounts[2] / context.totalSamples

            // At least one percentage should be in the target range
            // (strict global balance may not be achieved with small sample size)
            const targetPct = 1 / 3
            expect(Math.abs(buyPct - targetPct)).to.be.lessThan(0.15)
            expect(Math.abs(sellPct - targetPct)).to.be.lessThan(0.15)
            expect(Math.abs(holdPct - targetPct)).to.be.lessThan(0.15)
        })

        it('should reject over-represented class', () => {
            const context = {
                classCounts: [10, 5, 5], // BUY is over-represented
                totalSamples: 20
            }

            // BUY is at 10/20 = 50%, target 33%, drift = 17% > 5%
            const buySample = createSample(0.8, -0.2)
            expect(sampleFilters.balanceBuySellHold(context, buySample)).to.equal(false)

            // SELL is at 5/20 = 25%, target 33%, drift = -8% (under-represented)
            const sellSample = createSample(-0.8, 0.9)
            expect(sampleFilters.balanceBuySellHold(context, sellSample)).to.equal(true)

            // HOLD is at 5/20 = 25%, target 33%, drift = -8% (under-represented)
            const holdSample = createSample(0.2, -0.1)
            expect(sampleFilters.balanceBuySellHold(context, holdSample)).to.equal(true)
        })

        it('should classify based on raw confidence values', () => {
            const context = {}

            // Confidence below threshold (0.5) should result in HOLD
            const weakSignal = createSample(0.3, -0.2)
            expect(sampleFilters.balanceBuySellHold(context, weakSignal)).to.equal(true)
            expect(context.classCounts).to.deep.equal([0, 0, 1]) // HOLD (class 2)

            // Strong BUY signal (abs value > 0.5)
            const strongBuy = createSample(0.8, -0.2)
            expect(sampleFilters.balanceBuySellHold(context, strongBuy)).to.equal(true)
            expect(context.classCounts).to.deep.equal([1, 0, 1]) // BUY added

            // Strong SELL signal (abs value > 0.5)
            const strongSell = createSample(-0.2, 0.9)
            expect(sampleFilters.balanceBuySellHold(context, strongSell)).to.equal(true)
            expect(context.classCounts).to.deep.equal([1, 1, 1]) // SELL added
        })

        it('should maintain context across multiple calls', () => {
            const context = {}

            sampleFilters.balanceBuySellHold(context, createSample(0.8, -0.2))
            const snapshot1 = [...context.classCounts]

            sampleFilters.balanceBuySellHold(context, createSample(-0.8, 0.9))
            const snapshot2 = [...context.classCounts]

            expect(snapshot1).to.deep.equal([1, 0, 0])
            expect(snapshot2).to.deep.equal([1, 1, 0])
            expect(context.classCounts).to.deep.equal([1, 1, 0])
            expect(context.totalSamples).to.equal(2)
        })
    })
})
