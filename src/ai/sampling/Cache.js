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

class NamespacedCache {
    #caches = new Map()

    async trades (config) {
        return this.#getCache(config).trades(config)
    }

    async candles (config) {
        return this.#getCache(config).candles(config)
    }

    async samples (config) {
        return this.#getCache(config).samples(config)
    }

    #getCache (config) {
        const namespace = config.namespace ?? 'default'
        if (!this.#caches.has(namespace)) {
            this.#caches.set(namespace, new Cache())
        }
        return this.#caches.get(namespace)
    }
}

module.exports = {
    cache: new NamespacedCache()
}
