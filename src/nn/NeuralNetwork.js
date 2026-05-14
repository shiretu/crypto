import fs from 'fs'
import path from 'path'
import Fingerprint from '../utils/Fingerprint.js'

export default class NeuralNetwork {
    static #ARCH_DIR = path.resolve('configs', 'nn')
    static #RUNTIME_DIR = path.resolve('data', 'nn', 'runtimes')

    #arch
    #personality
    #trainingRootPath

    constructor (config) {
        if (!config.personality) throw new Error('config.personality is required')
        if (!config.personality.data) throw new Error('config.personality.data is required')
        if (!config.personality.train) throw new Error('config.personality.train is required')
        this.#personality = config.personality
        const archPath = path.join(NeuralNetwork.#ARCH_DIR, config.name, 'arch.json')
        this.#arch = JSON.parse(fs.readFileSync(archPath, 'utf8'))
        const fingerprint = Fingerprint.compute({ data: this.#personality.data, train: this.#personality.train })
        this.#trainingRootPath = path.join(NeuralNetwork.#RUNTIME_DIR, config.name, fingerprint)
        fs.mkdirSync(this.#trainingRootPath, { recursive: true })
        fs.writeFileSync(path.join(this.#trainingRootPath, 'recipe.json'), JSON.stringify(this.#personality, null, 2))
    }

    get arch () { return this.#arch }
    get personality () { return this.#personality }
    get trainingRootPath () { return this.#trainingRootPath }

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
