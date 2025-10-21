module.exports = {
    getSignal: async (signalName, events, exchangeName, symbol) => {
        return await require(`./${signalName}/signal`).create(events, exchangeName, symbol)
    }
}
