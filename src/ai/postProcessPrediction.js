const TradeKind = require('../core/TradeKind')

module.exports = {

    postProcessPrediction: (direction) => {
        const decisionPoint = 0.5

        let tradeKind
        if (direction > decisionPoint) {
            tradeKind = TradeKind.buy
        } else if (direction < -1 * decisionPoint) {
            tradeKind = TradeKind.sell
        } else {
            tradeKind = TradeKind.hold
        }

        return {
            kind: tradeKind,
            direction
        }
    }
}
