/**
 * A collection of named, stateless normalisation functions for a sample.
 *
 * Each function takes a `{ candles, outcome }` pair (the same shape
 * DataSet#produce collects) and returns the complete on-disk record for that
 * sample:
 *
 *     {
 *         features: number[],   // flat, length = featuresCount
 *         labels:   number[]    // flat, length = labelsCount
 *     }
 *
 * DataSet#produce is intentionally agnostic about what the floats mean: it
 * takes `featuresCount` and `labelsCount` from the first successful call and
 * writes features-then-labels into samples.bin (little-endian float32). The
 * NN consumer reshapes back using its knowledge of the normaliser.
 *
 * Dispatched by string name from the recipe's `normalisationFunction` field:
 *
 *     const fn = Normalisers[name]
 *     if (!Object.hasOwn(Normalisers, name) || typeof fn !== 'function') throw ...
 *     const { features, labels } = fn({ candles, outcome })
 *
 * A normaliser may `throw` to refuse a sample (e.g. division-by-zero on a
 * gap-filler window); DataSet catches and silently drops it.
 */
export default class Normalisers {
    /**
     * percentFromMin: per-window min-max scaling.
     *
     * For each channel (tsUs, price, baseVolume, tradeCount) we take the
     * window's [min, max] and remap every value to `(v - min) / (max - min)`.
     * Every channel ends up exactly in `[0, 1]` — the window minimum lands at
     * 0 and the window maximum at 1. Because the candles array is
     * chronologically ordered, the tsUs channel always reports 0 on the first
     * candle and 1 on the last.
     *
     * Feature layout (windowSize * 7 floats, in candle order):
     *   - tsFraction  : (open.tsUs   - minTsUs)        / (maxTsUs       - minTsUs)
     *   - open        : (open        - minPrice)       / (maxPrice      - minPrice)
     *   - high        : (high        - minPrice)       / (maxPrice      - minPrice)
     *   - low         : (low         - minPrice)       / (maxPrice      - minPrice)
     *   - close       : (close       - minPrice)       / (maxPrice      - minPrice)
     *   - baseVolume  : (baseVolume  - minBaseVolume)  / (maxBaseVolume - minBaseVolume)
     *   - tradeCount  : (tradeCount  - minTradeCount)  / (maxTradeCount - minTradeCount)
     *
     * Label layout (2 floats):
     *   - longWon  : 1 if outcome.longOrder.profitPercent  > 0 else 0
     *   - shortWon : 1 if outcome.shortOrder.profitPercent > 0 else 0
     *
     * @param {{ candles: import('../core/Candle.js').default[], outcome: import('../core/Outcome.js').default }} sample
     * @returns {{ features: number[], labels: number[] }}
     * @throws if any channel's range (max - min) is 0 (flat window) — the
     *         sample can't be min-max scaled and must be skipped.
     */
    static percentFromMin ({ candles, outcome }) {
        const agg = candles.reduce((a, c) => {
            a.minTsUs = Math.min(a.minTsUs, c.open.tsUs)
            a.maxTsUs = Math.max(a.maxTsUs, c.open.tsUs)
            a.minPrice = Math.min(a.minPrice, c.low.price)
            a.maxPrice = Math.max(a.maxPrice, c.high.price)
            a.minBaseVolume = Math.min(a.minBaseVolume, c.baseVolume)
            a.maxBaseVolume = Math.max(a.maxBaseVolume, c.baseVolume)
            a.minTradeCount = Math.min(a.minTradeCount, c.tradeCount)
            a.maxTradeCount = Math.max(a.maxTradeCount, c.tradeCount)
            return a
        }, {
            minTsUs: Infinity,
            maxTsUs: -Infinity,
            minPrice: Infinity,
            maxPrice: -Infinity,
            minBaseVolume: Infinity,
            maxBaseVolume: -Infinity,
            minTradeCount: Infinity,
            maxTradeCount: -Infinity
        })
        // Guard the divisors. Min-max scaling needs a non-zero range on every
        // channel; a perfectly flat channel (max === min) would emit NaN. This
        // also catches gap-filler windows whose baseVolume/tradeCount are
        // identically 0 across the window, and single-candle windows whose
        // tsUs range collapses to 0.
        const tsUsRange = agg.maxTsUs - agg.minTsUs
        const priceRange = agg.maxPrice - agg.minPrice
        const baseVolumeRange = agg.maxBaseVolume - agg.minBaseVolume
        const tradeCountRange = agg.maxTradeCount - agg.minTradeCount
        if (tsUsRange <= 0 || priceRange <= 0 || baseVolumeRange <= 0 || tradeCountRange <= 0) {
            throw new Error(
                'percentFromMin: zero-width channel range ' +
                `(tsUsRange=${tsUsRange}, priceRange=${priceRange}, ` +
                `baseVolumeRange=${baseVolumeRange}, tradeCountRange=${tradeCountRange})`
            )
        }
        const norm = (v, base, range) => (v - base) / range

        const features = []
        for (const candle of candles) {
            features.push(
                norm(candle.open.tsUs, agg.minTsUs, tsUsRange),
                norm(candle.open.price, agg.minPrice, priceRange),
                norm(candle.high.price, agg.minPrice, priceRange),
                norm(candle.low.price, agg.minPrice, priceRange),
                norm(candle.close.price, agg.minPrice, priceRange),
                norm(candle.baseVolume, agg.minBaseVolume, baseVolumeRange),
                norm(candle.tradeCount, agg.minTradeCount, tradeCountRange)
            )
        }
        const labels = [
            outcome.longOrder && outcome.longOrder.profitPercent > 0 ? 1 : 0,
            outcome.shortOrder && outcome.shortOrder.profitPercent > 0 ? 1 : 0
        ]
        return { features, labels }
    }
}
