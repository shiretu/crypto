const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node') // Enable Node.js backend for file operations
const paths = require('../../sampling/paths')
const fs = require('fs').promises

class Model {
    #arch /** @type {object} The architecture of the model */
    #summary = { runner: 'tf' } /** @type {object} The summary of the model */

    static async create (config) {
        const model = new Model()
        await model.#init(config)
        return model
    }

    get summary () { return this.#summary }

    async #init (config) {
        this.#arch = JSON.parse(await fs.readFile(paths.modelArch(config), 'utf-8'))
    }

    async train (sample) {
        throw new Error('Not implemented yet')
    }

    async inference (inputs) {
        throw new Error('Not implemented yet')
    }

    async save () {
        throw new Error('Not implemented yet')
    }
}

module.exports = Model
