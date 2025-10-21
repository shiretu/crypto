module.exports = {
    getSignal: async (events, strategyName, exchangeName, symbol) => {
        return await require(`./${strategyName}/signal`).create(events, exchangeName, symbol)
    }
}
