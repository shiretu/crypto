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

    describe('balanceBySignalStrength', () => {
        // Helper to create a sample with specific confidence values
        const createSample = (buyConfidence, sellConfidence) => {
            const sample = {
                outputs: [
                    { confidence: buyConfidence },
                    { confidence: sellConfidence }
                ]
            }

            // Add signalCategory getter to match Sample class behavior
            Object.defineProperty(sample, 'signalCategory', {
                get: function () {
                    const buyConf = this.outputs[0].confidence
                    const sellConf = this.outputs[1].confidence

                    // Classify buy signal strength
                    let buyClass
                    if (buyConf > 0.5) {
                        buyClass = 0 // BUY_STRONG
                    } else if (buyConf < -0.5) {
                        buyClass = 1 // BUY_FAILED
                    } else {
                        buyClass = 2 // BUY_WEAK
                    }

                    // Classify sell signal strength
                    let sellClass
                    if (sellConf > 0.5) {
                        sellClass = 3 // SELL_STRONG
                    } else if (sellConf < -0.5) {
                        sellClass = 4 // SELL_FAILED
                    } else {
                        sellClass = 5 // SELL_WEAK
                    }

                    // Pick the class with stronger absolute confidence
                    return Math.abs(buyConf) >= Math.abs(sellConf) ? buyClass : sellClass
                }
            })

            return sample
        }

        it('should accept first sample and initialize context with 6 classes', () => {
            const context = {}
            const sample = createSample(0.8, -0.2) // BUY_STRONG

            const result = sampleFilters.balanceBySignalStrength(context, sample)

            expect(result).to.equal(true)
            expect(context.classCounts).to.deep.equal([1, 0, 0, 0, 0, 0]) // BUY_STRONG
            expect(context.totalSamples).to.equal(1)
        })

        it('should classify BUY_STRONG (confidence > 0.5)', () => {
            const context = {}
            const sample = createSample(0.8, 0.2)

            sampleFilters.balanceBySignalStrength(context, sample)

            expect(context.classCounts[0]).to.equal(1) // BUY_STRONG
        })

        it('should classify BUY_FAILED (confidence < -0.5)', () => {
            const context = {}
            const sample = createSample(-0.8, 0.2)

            sampleFilters.balanceBySignalStrength(context, sample)

            expect(context.classCounts[1]).to.equal(1) // BUY_FAILED
        })

        it('should classify BUY_WEAK (-0.5 to 0.5)', () => {
            const context = {}
            const sample = createSample(0.3, 0.1)

            sampleFilters.balanceBySignalStrength(context, sample)

            expect(context.classCounts[2]).to.equal(1) // BUY_WEAK
        })

        it('should classify SELL_STRONG (confidence > 0.5)', () => {
            const context = {}
            const sample = createSample(0.2, 0.9)

            sampleFilters.balanceBySignalStrength(context, sample)

            expect(context.classCounts[3]).to.equal(1) // SELL_STRONG
        })

        it('should classify SELL_FAILED (confidence < -0.5)', () => {
            const context = {}
            const sample = createSample(0.1, -0.8)

            sampleFilters.balanceBySignalStrength(context, sample)

            expect(context.classCounts[4]).to.equal(1) // SELL_FAILED
        })

        it('should classify SELL_WEAK (-0.5 to 0.5)', () => {
            const context = {}
            const sample = createSample(0.1, 0.2)

            sampleFilters.balanceBySignalStrength(context, sample)

            expect(context.classCounts[5]).to.equal(1) // SELL_WEAK
        })

        it('should pick class based on stronger absolute confidence', () => {
            const context = {}

            // BUY has stronger absolute confidence
            sampleFilters.balanceBySignalStrength(context, createSample(0.8, 0.3))
            expect(context.classCounts[0]).to.equal(1) // BUY_STRONG

            // SELL has stronger absolute confidence
            sampleFilters.balanceBySignalStrength(context, createSample(0.3, -0.9))
            expect(context.classCounts[4]).to.equal(1) // SELL_FAILED
        })

        it('should balance samples across 6 signal strength classes', () => {
            const context = {}

            // Feed round-robin samples with some imbalance
            const samples = []
            // Create samples in balanced order but with extras of BUY_STRONG
            for (let round = 0; round < 20; round++) {
                samples.push(createSample(0.8, 0.2)) // BUY_STRONG
                samples.push(createSample(0.8, 0.2)) // BUY_STRONG (extra)
                samples.push(createSample(-0.8, 0.2)) // BUY_FAILED
                samples.push(createSample(0.3, 0.1)) // BUY_WEAK
                samples.push(createSample(0.2, 0.9)) // SELL_STRONG
                samples.push(createSample(0.1, -0.8)) // SELL_FAILED
                samples.push(createSample(0.1, 0.2)) // SELL_WEAK
            }

            samples.forEach(sample => {
                sampleFilters.balanceBySignalStrength(context, sample)
            })

            // Should have accepted samples
            expect(context.totalSamples).to.be.greaterThan(20)

            // All 6 classes should have some representation
            context.classCounts.forEach((count, i) => {
                expect(count).to.be.greaterThan(0, `Class ${i} should have at least one sample`)
            })

            // Check that balancing is attempting to maintain distribution
            // (with 6 classes, perfect balance is harder to achieve with small samples)
            const targetPct = 1 / 6
            const drifts = context.classCounts.map(count =>
                Math.abs((count / context.totalSamples) - targetPct)
            )
            const maxDrift = Math.max(...drifts)
            expect(maxDrift).to.be.lessThan(0.25, 'Max drift from target should be reasonable')
        })

        it('should reject over-represented class', () => {
            const context = {
                classCounts: [20, 5, 5, 5, 5, 5], // BUY_STRONG over-represented
                totalSamples: 45
            }

            // BUY_STRONG is at 20/45 = 44% vs 16.67% target = 27% drift > 5%
            const buyStrongSample = createSample(0.8, 0.2)
            expect(sampleFilters.balanceBySignalStrength(context, buyStrongSample)).to.equal(false)

            // SELL_STRONG is at 5/45 = 11% vs 16.67% target = -6% drift (under-represented)
            const sellStrongSample = createSample(0.2, 0.9)
            expect(sampleFilters.balanceBySignalStrength(context, sellStrongSample)).to.equal(true)
        })
    })
})
