module.exports = {
    getSignal: async (signalName, events, exchangeName, symbol) => {
        return await require(`./${signalName}`).create(events, exchangeName, symbol)
    }
}
