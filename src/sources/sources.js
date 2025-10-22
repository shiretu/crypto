module.exports = {
    /**
     * Get a source instance for the given exchange and symbol.
     * @param {EventEmitter} events - Event emitter to use
     * @param {string} exchangeName - exchange identifier
     * @param {Symbol} symbol - Symbol instance
     */
    getSource: async (events, exchangeName, symbol) => {
        return await (require(`./${exchangeName}`)).create(events, symbol)
    }
}
