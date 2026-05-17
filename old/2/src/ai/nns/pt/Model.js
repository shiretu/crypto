class Model {
    #runner = 'pt'

    static async create (config) {
        const model = new Model()
        await model.#init(config)
        return model
    }

    get runner () {
        return this.#runner
    }

    async #init (config) {
        throw new Error('Not implemented')
    }
}

module.exports = Model
