module.exports = {
    getStrategy: async (events, strategyName, exchangeName, symbol) => {
        return await require(`./${strategyName}/strategy`).getStrategy(events, exchangeName, symbol)
    }
}
