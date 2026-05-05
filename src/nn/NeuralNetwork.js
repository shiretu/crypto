import fs from 'fs'
import path from 'path'

const NN_DIR = path.resolve('nn')

export default class NeuralNetwork {
    #config
    #path
    #arch
    #runtimePath

    constructor (config) {
        this.#config = config
        this.#path = path.join(NN_DIR, config.name)
        this.#arch = JSON.parse(fs.readFileSync(path.join(this.#path, 'arch.json'), 'utf8'))
        if (!config.train) throw new Error('config.train is required')
        this.#runtimePath = path.join(this.#path, 'runtime')
        fs.mkdirSync(this.#runtimePath, { recursive: true })
    }

    get config () { return this.#config }
    get path () { return this.#path }
    get arch () { return this.#arch }
    get runtimePath () { return this.#runtimePath }

    static async create (config) {
        throw new Error('create() not implemented')
    }

    static async load (config) {
        throw new Error('load() not implemented')
    }

    static async loadOrCreate (config) {
        try {
            return await this.load(config)
        } catch (err) {
            if (err.code !== 'MODEL_NOT_FOUND') throw err
            return await this.create(config)
        }
    }

    async save () {
        throw new Error('save() not implemented')
    }

    async train (data) {
        throw new Error('train() not implemented')
    }

    async predict (data) {
        throw new Error('predict() not implemented')
    }
}
