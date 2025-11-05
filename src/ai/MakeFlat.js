module.exports = (inputs, outputs) => {
    return [
        // Candles: 9 arrays × 120 = 1080 features
        ...inputs.candles.opens,
        ...inputs.candles.highs,
        ...inputs.candles.lows,
        ...inputs.candles.closes,
        ...inputs.candles.volumes,
        ...inputs.candles.timestamps,
        ...inputs.candles.colors,
        ...inputs.candles.bodySizes,
        ...inputs.candles.tradesCount,

        // Studies: 837 features total
        ...inputs.studies.macdShort, // 120
        ...inputs.studies.macdLong, // 120
        ...inputs.studies.macdLine, // 120
        ...inputs.studies.macdSignal, // 120
        ...inputs.studies.macdHistogram, // 120
        ...inputs.studies.unused1, // 119
        ...inputs.studies.unused2, // 118

        // Patterns: 237 features
        ...inputs.patterns.single, // 119
        ...inputs.patterns.sliding, // 118

        // Global: 6 features
        inputs.global.candleDuration,
        inputs.global.windowSize,
        inputs.global.grossProfitTarget,
        inputs.global.grossStopLoss,
        inputs.global.positionSize,
        inputs.global.fees,

        // Outputs: 2 features (only if outputs exists)
        ...(outputs ? [outputs.buyProfitPercent, outputs.sellProfitPercent] : [])
    ]
}
