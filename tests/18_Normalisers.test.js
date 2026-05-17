import { expect } from 'chai'
import Normalisers from '../src/nn/Normalisers.js'
import Day from '../src/utils/Day.js'

// Build a Candle-shaped object exposing exactly the fields percentFromMin reads:
//   open.tsUs + open/high/low/close.price + baseVolume + tradeCount.
// dayStart is taken from candles[0].open.tsUs, so the first candle's tsUs anchors
// the intraday tsFraction = (tsUs - dayStart) / Day.usPerDay.
const mkCandle = (tsUs, o, h, l, c, baseVolume, tradeCount) => ({
    open: { tsUs, price: o },
    high: { price: h },
    low: { price: l },
    close: { price: c },
    baseVolume,
    tradeCount
})

// outcome shape consumed by percentFromMin: just longOrder.profitPercent and
// shortOrder.profitPercent. Either order may be missing (label becomes 0).
const mkOutcome = (longPP, shortPP) => ({
    longOrder: longPP === null ? null : { profitPercent: longPP },
    shortOrder: shortPP === null ? null : { profitPercent: shortPP }
})

describe('Normalisers', () => {
    describe('percentFromMin', () => {
        it('should min-max scale each channel to [0,1] within the window', () => {
            // Fixture (all on the same UTC day, dayStart = candle[0].open.tsUs day):
            //   candle 0: tsUs = 0,                    o=110 h=120 l=105 c=115  baseVolume=20 tradeCount=15
            //   candle 1: tsUs = Day.usPerDay / 4,     o=115 h=125 l=100 c=108  baseVolume=30 tradeCount=10
            //   candle 2: tsUs = Day.usPerDay / 2,     o=108 h=112 l=104 c=111  baseVolume=40 tradeCount=20
            //
            // Per-channel mins / maxes / ranges:
            //   minTsUs = 0                            maxTsUs = Day.usPerDay/2               tsUsRange = Day.usPerDay/2
            //   minPrice = min(105, 100, 104) = 100   maxPrice = max(120, 125, 112) = 125   priceRange = 25
            //   minBaseVolume = 20                     maxBaseVolume = 40                     baseVolumeRange = 20
            //   minTradeCount = 10                     maxTradeCount = 20                     tradeCountRange = 10
            //
            // Hand-computed features (7 floats / candle: tsFraction, o, h, l, c, baseVol, tradeCount):
            //   candle 0: [0/(Day.usPerDay/2),               (110-100)/25, (120-100)/25, (105-100)/25, (115-100)/25, (20-20)/20, (15-10)/10]
            //          == [0.00,                              0.40,         0.80,         0.20,         0.60,         0.0,        0.5      ]
            //   candle 1: [(Day.usPerDay/4)/(Day.usPerDay/2), (115-100)/25, (125-100)/25, (100-100)/25, (108-100)/25, (30-20)/20, (10-10)/10]
            //          == [0.50,                              0.60,         1.00,         0.00,         0.32,         0.5,        0.0      ]
            //   candle 2: [(Day.usPerDay/2)/(Day.usPerDay/2), (108-100)/25, (112-100)/25, (104-100)/25, (111-100)/25, (40-20)/20, (20-10)/10]
            //          == [1.00,                              0.32,         0.48,         0.16,         0.44,         1.0,        1.0      ]
            //
            // Outcome: longOrder.profitPercent =  1.5 (>0 -> longWon = 1)
            //          shortOrder.profitPercent = -1.0 (<=0 -> shortWon = 0)
            const candles = [
                mkCandle(0, 110, 120, 105, 115, 20, 15),
                mkCandle(Day.usPerDay / 4, 115, 125, 100, 108, 30, 10),
                mkCandle(Day.usPerDay / 2, 108, 112, 104, 111, 40, 20)
            ]
            const outcome = mkOutcome(1.5, -1)

            const { features, labels } = Normalisers.percentFromMin({ candles, outcome })

            const close = (a, b) => Math.abs(a - b) < 1e-12
            expect(features).to.have.lengthOf(21)
            expect(labels).to.have.lengthOf(2)

            const expected = [
                // candle 0
                0.00, 0.40, 0.80, 0.20, 0.60, 0.0, 0.5,
                // candle 1
                0.50, 0.60, 1.00, 0.00, 0.32, 0.5, 0.0,
                // candle 2
                1.00, 0.32, 0.48, 0.16, 0.44, 1.0, 1.0
            ]
            for (let i = 0; i < expected.length; i++) {
                expect(close(features[i], expected[i]), `features[${i}] = ${features[i]} != ${expected[i]}`).to.equal(true)
            }
            expect(labels).to.deep.equal([1, 0])
        })

        it('should map each channel-min to exactly 0 and each channel-max to exactly 1', () => {
            // Distinct min and max candles per channel so we can check the endpoints.
            //   prices       : low min = 90 (candle 1), high max = 130 (candle 2)
            //   baseVolume   : min = 5 (candle 0), max = 50 (candle 2)
            //   tradeCount   : min = 2 (candle 1), max = 25 (candle 0)
            const candles = [
                mkCandle(0, 100, 110, 95, 105, 5, 25),
                mkCandle(Day.usPerDay / 8, 95, 105, 90, 100, 30, 2),
                mkCandle(Day.usPerDay / 4, 120, 130, 110, 125, 50, 10)
            ]
            const { features } = Normalisers.percentFromMin({ candles, outcome: mkOutcome(0, 0) })
            // candle 1 low feature (index 1*7 + 3 = 10) should be 0 (low = minPrice = 90)
            expect(features[10]).to.equal(0)
            // candle 2 high feature (index 2*7 + 2 = 16) should be 1 (high = maxPrice = 130)
            expect(features[16]).to.equal(1)
            // candle 0 baseVolume (index 0*7 + 5 = 5) should be 0
            expect(features[5]).to.equal(0)
            // candle 2 baseVolume (index 2*7 + 5 = 19) should be 1
            expect(features[19]).to.equal(1)
            // candle 1 tradeCount (index 1*7 + 6 = 13) should be 0
            expect(features[13]).to.equal(0)
            // candle 0 tradeCount (index 0*7 + 6 = 6) should be 1
            expect(features[6]).to.equal(1)
        })

        it('should emit every feature in [0, 1]', () => {
            const candles = [
                mkCandle(0, 200, 210, 195, 205, 50, 12),
                mkCandle(Day.usPerDay / 6, 205, 215, 190, 200, 60, 14),
                mkCandle(Day.usPerDay / 3, 200, 220, 198, 218, 70, 11)
            ]
            const { features } = Normalisers.percentFromMin({ candles, outcome: mkOutcome(2, -1.5) })
            for (let i = 0; i < features.length; i++) {
                expect(features[i], `features[${i}] = ${features[i]} should be in [0, 1]`).to.be.within(0, 1)
            }
        })

        it('should derive labels from outcome.longOrder / outcome.shortOrder profitPercent signs', () => {
            // Use a 2-candle window so every channel has a non-zero range (otherwise
            // the normaliser throws). Prices/volumes/tradeCounts differ between candles.
            const candles = [
                mkCandle(0, 10, 11, 9, 10, 5, 4),
                mkCandle(Day.usPerDay / 4, 11, 12, 10, 11, 7, 6)
            ]
            // Both positive -> [1, 1]
            expect(Normalisers.percentFromMin({ candles, outcome: mkOutcome(0.3, 0.7) }).labels)
                .to.deep.equal([1, 1])
            // Long positive, short zero/negative -> [1, 0]
            expect(Normalisers.percentFromMin({ candles, outcome: mkOutcome(0.5, 0) }).labels)
                .to.deep.equal([1, 0])
            // Both non-positive -> [0, 0]
            expect(Normalisers.percentFromMin({ candles, outcome: mkOutcome(-0.1, -0.2) }).labels)
                .to.deep.equal([0, 0])
            // Missing orders treated as 0 (no win).
            expect(Normalisers.percentFromMin({ candles, outcome: mkOutcome(null, null) }).labels)
                .to.deep.equal([0, 0])
        })

        it('should throw "zero-width channel range" when any channel is flat across the window', () => {
            const outcome = mkOutcome(0, 0)
            // Single candle -> every range is 0 -> throws on price first.
            expect(() => Normalisers.percentFromMin({
                candles: [mkCandle(0, 10, 10, 10, 10, 5, 3)], outcome
            })).to.throw(/zero-width channel range/)
            // Flat prices but baseVolume/tradeCount vary -> still throws (price first).
            expect(() => Normalisers.percentFromMin({
                candles: [
                    mkCandle(0, 10, 10, 10, 10, 5, 3),
                    mkCandle(Day.usPerDay / 4, 10, 10, 10, 10, 8, 7)
                ],
                outcome
            })).to.throw(/zero-width channel range/)
            // Prices vary but baseVolume flat -> throws.
            expect(() => Normalisers.percentFromMin({
                candles: [
                    mkCandle(0, 10, 11, 9, 10, 5, 3),
                    mkCandle(Day.usPerDay / 4, 12, 13, 11, 12, 5, 7)
                ],
                outcome
            })).to.throw(/zero-width channel range/)
            // Prices and baseVolume vary but tradeCount flat -> throws.
            expect(() => Normalisers.percentFromMin({
                candles: [
                    mkCandle(0, 10, 11, 9, 10, 5, 3),
                    mkCandle(Day.usPerDay / 4, 12, 13, 11, 12, 8, 3)
                ],
                outcome
            })).to.throw(/zero-width channel range/)
        })
    })

    describe('dispatch contract', () => {
        it('should expose normaliser names as own static properties (for safe dispatch)', () => {
            expect(Object.hasOwn(Normalisers, 'percentFromMin')).to.equal(true)
            expect(typeof Normalisers.percentFromMin).to.equal('function')
        })

        it('should not expose inherited Function.prototype members as own', () => {
            expect(Object.hasOwn(Normalisers, 'toString')).to.equal(false)
            expect(Object.hasOwn(Normalisers, 'bind')).to.equal(false)
        })
    })
})
