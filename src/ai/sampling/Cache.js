class Cache {
    #trades /** @type {Trades} */
    #candles /** @type {Candles} */
    #samples /** @type {Samples} */

    /**
     * Get Trades instance from cache or create a new one
     * @param {*} config
     * @returns {Trades}
     */
    async trades (config) {
        if (!this.#trades) { this.#trades = await require('./Trades').create(config) }
        return this.#trades
    }

    /**
     * Get Candles instance from cache or create a new one
     * @param {*} config
     * @returns {Candles}
     */
    async candles (config) {
        if (!this.#candles) { this.#candles = await require('./Candles').create(config) }
        return this.#candles
    }

    /**
     * Get Samples instance from cache or create a new one
     * @param {*} config
     * @returns {Samples}
     */
    async samples (config) {
        if (!this.#samples) { this.#samples = await require('./Samples').create(config) }
        return this.#samples
    }
}

module.exports = {
    cache: new Cache()
}
