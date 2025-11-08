class Tf {
    #config /* @type {object} */

    constructor (config) {
        this.#config = config
    }

    static async load (config) {
        const result = new Tf(config)
        await result.#init()
        return result
    }

    train (samples) {
        throw new Error('TensorFlow model training not implemented')
    }

    pred (input) {
        throw new Error('TensorFlow model prediction not implemented')
    }

    #init () {
        throw new Error('TensorFlow model initialization not implemented')
    }
}

module.exports = {
    load: async (config) => { return await Tf.load(config) }
}
