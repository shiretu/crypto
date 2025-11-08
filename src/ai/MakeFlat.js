module.exports = (inputs, output) => {
    return [
        // Candles
        ...inputs.candles.opens,
        ...inputs.candles.highs,
        ...inputs.candles.lows,
        ...inputs.candles.closes,
        ...inputs.candles.volumes,
        ...inputs.candles.timestamps,
        ...inputs.candles.colors,
        ...inputs.candles.bodySizes,
        ...inputs.candles.tradesCount,

        // Studies
        ...inputs.studies.macdShort,
        ...inputs.studies.macdLong,
        ...inputs.studies.macdLine,
        ...inputs.studies.macdSignal,
        ...inputs.studies.macdHistogram,

        // Global
        inputs.global.candleDuration,
        inputs.global.windowSize,
        inputs.global.profitTargetPercent,
        inputs.global.stopLossPercent,
        inputs.global.positionSize,
        inputs.global.fees,

        // Output
        ...(output ? [output] : [])
    ]
}
