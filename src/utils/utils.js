const dayDurationMs = 24 * 3600 * 1000

const dayStart = (tsMs) => {
    return Math.floor(tsMs / dayDurationMs) * dayDurationMs
}

module.exports = {
    computeBuyProfit: (buyPrice, sellPrice, buyQuoteQty, buyFeePer = 0.001, sellFeePer = 0.001) => {
        const buyBaseQty = buyQuoteQty / buyPrice
        const buyFeeQty = buyQuoteQty * buyFeePer
        const sellQuoteQty = buyBaseQty * sellPrice
        const sellFeeQty = sellQuoteQty * sellFeePer
        return sellQuoteQty - buyQuoteQty - buyFeeQty - sellFeeQty
    },
    computeSellProfit: (sellPrice, buyPrice, sellBaseQty, sellFeePer = 0.001, buyFeePer = 0.001) => {
        const sellQuoteQty = sellBaseQty * sellPrice
        const sellFeeQty = sellQuoteQty * sellFeePer
        const buyBaseQty = sellQuoteQty / buyPrice
        const buyFeeQty = sellQuoteQty * buyFeePer
        return (buyBaseQty - sellBaseQty) * buyPrice - sellFeeQty - buyFeeQty
    },
    safeExec: async (fnc) => {
        try {
            await fnc()
        } catch (e) {
            console.error(e)
        }
    },
    dayStart,
    dayDurationMs
}
