const TradeKind = require('../core/TradeKind')

module.exports = {

    postProcessPrediction: (buyProfitPercent, sellProfitPercent) => {
        const tradeKind = buyProfitPercent > sellProfitPercent ? TradeKind.buy : TradeKind.sell
        return {
            kind: Math.max(buyProfitPercent, sellProfitPercent) > 0 ? tradeKind : TradeKind.hold,
            percent: Math.max(buyProfitPercent, sellProfitPercent),
            percentages: {
                buy: buyProfitPercent,
                sell: sellProfitPercent
            }
        }
    }
}
