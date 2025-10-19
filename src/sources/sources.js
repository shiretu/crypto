module.exports = {
    getSource: async (events, exchangeName, symbolName) => {
        return await require(`./${exchangeName}/source`).getSource(events, symbolName)
    }
}
