import fs from 'fs'
import path from 'path'
import Fingerprint from '../utils/Fingerprint.js'

export default class DataSet {
    static #ROOT_DIR = path.resolve('data', 'nn', 'datasets')

    #data
    #fingerprint
    #rootPath
    #samplesCount
    #featuresCount
    #labelsCount
    #featureSize
    #labelSize

    constructor (data) {
        if (!data) throw new Error('data is required')
        this.#data = data
        this.#fingerprint = Fingerprint.compute(data)
        this.#rootPath = path.join(DataSet.#ROOT_DIR, this.#fingerprint)
    }

    get data () { return this.#data }
    get samplesCount () { return this.#samplesCount }
    get featuresCount () { return this.#featuresCount }
    get labelsCount () { return this.#labelsCount }
    get featureSize () { return this.#featureSize } // bytes per feature
    get labelSize () { return this.#labelSize } // bytes per label

    // Returns the dataset, producing it on disk first if it isn't there yet.
    async load () {
        if (!this.#exists()) await this.#produce()
        return await this.#read()
    }

    // True if data/nn/datasets/<fingerprint>/ already contains a produced dataset.
    // TODO: decide on the marker (e.g. presence of recipe.json + samples.bin).
    #exists () {
        return fs.existsSync(this.#rootPath)
    }

    // Generate the dataset from scratch and persist it under #rootPath.
    // TODO: load candles for data.symbol over [startDay, endDay], compute outcomes
    // using tpPercent/slPercent, slice windows of length windowSize (optionally with
    // randomWindowPosition), draw samplesCount samples, write recipe.json + samples.bin.
    async #produce () {
        throw new Error('#produce() not implemented')
    }

    // Read a previously produced dataset from #rootPath.
    // TODO: read recipe.json (sanity-check it matches this.#data), then mmap/stream samples.bin.
    async #read () {
        throw new Error('#read() not implemented')
    }
}
