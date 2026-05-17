module.exports = {
    getSignal: async (signalName, events, exchangeName, symbol, ...restOfParams) => {
        return await new (require(`./${signalName}`))(events, exchangeName, symbol, ...restOfParams)
    }
}
