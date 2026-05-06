import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export default class NeuralNetwork {
    static #NN_DIR = path.resolve('nn')

    #arch
    #personality
    #trainingRootPath

    constructor (config) {
        const canonicalize = (obj) => {
            if (obj === null || typeof obj !== 'object') return obj
            if (Array.isArray(obj)) return obj.map(canonicalize)
            return Object.keys(obj).sort().reduce((acc, key) => {
                acc[key] = canonicalize(obj[key])
                return acc
            }, {})
        }

        if (!config.personality) throw new Error('config.personality is required')
        if (!config.personality.data) throw new Error('config.personality.data is required')
        if (!config.personality.train) throw new Error('config.personality.train is required')
        this.#personality = config.personality
        const rootPath = path.join(NeuralNetwork.#NN_DIR, config.name)
        this.#arch = JSON.parse(fs.readFileSync(path.join(rootPath, 'arch.json'), 'utf8'))
        const recipe = canonicalize({ data: this.#personality.data, train: this.#personality.train })
        const fingerprint = crypto.createHash('sha256').update(JSON.stringify(recipe)).digest('hex').slice(0, 16)
        this.#trainingRootPath = path.join(rootPath, 'runtime', fingerprint)
        fs.mkdirSync(this.#trainingRootPath, { recursive: true })
        fs.writeFileSync(path.join(this.#trainingRootPath, 'recipe.json'), JSON.stringify(recipe, null, 2))
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
