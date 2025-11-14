const path = require('path')
const paths = require('./paths')
const fs = require('fs').promises
const { cache } = require('./Cache')
const Sample = require('./Sample')
const { readFullFile } = require('./readFullFile')
const { progressBar } = require('./progressBar')

class Samples {
    static #version = 1
    #metadata /** @type {object} */
    #data /** @type {Float64Array} */

    static async create (config) {
        const result = new Samples()
        await result.#init(config)
        return result
    }

    get length () {
        return this.#metadata.length
    }

    get inputsLength () {
        return this.#metadata.inputsLength
    }

    get outputsLength () {
        return this.#metadata.outputsLength
    }

    read (index) {
        const start = index * (this.inputsLength + this.outputsLength)
        const end = start + this.inputsLength + this.outputsLength
        const sampleData = this.#data.subarray(start, end)
        return Sample.load(sampleData, this.inputsLength)
    }

    async #init (config) {
        try {
            await this.#load(config)
        } catch (err) {
            await this.#generate(config)
            await this.#load(config)
        }
    }

    async #load (config) {
        const bytes = await readFullFile(paths.samples(config))
        const data = new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 8)
        this.#metadata = JSON.parse(bytes.subarray(8, 8 + Number(data[0])).toString('utf-8'))
        if (this.#metadata.version !== Samples.#version) {
            throw new Error(`Samples version mismatch: expected ${Samples.#version}, got ${this.#metadata.version}`)
        }
        this.#data = data.subarray(1 + (Number(data[0]) / 8))
        if (this.#data.length !== this.#metadata.length * (this.#metadata.inputsLength + this.#metadata.outputsLength)) {
            throw new Error('Samples data size does not match metadata')
        }
    }

    async #generate (config) {
        const candles = await cache.candles(config)
        const startCandleIndex = candles.find(c => c.tsUs.open - (config.train.startTimestamp.getTime() * 1000))
        const endCandleIndex = candles.find(c => c.tsUs.open - (config.train.endTimestamp.getTime() * 1000))
        const length = endCandleIndex - startCandleIndex

        const metadata = {
            version: Samples.#version,
            length
        }
        const metadataBuffer = await (async () => {
            const sample = await Sample.compute(config, startCandleIndex)
            metadata.inputsLength = sample.rawInputs.length
            metadata.outputsLength = sample.rawOutputs.length
            const result = JSON.stringify(metadata)
            const padSize = Math.ceil(Buffer.byteLength(result) / 8) * 8
            return Buffer.from(result + ' '.repeat(padSize - Buffer.byteLength(result)), 'utf-8')
        })()

        const filePath = paths.samples(config)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, Float64Array.from([metadataBuffer.length])) // create empty file
        await fs.appendFile(filePath, metadataBuffer)
        const bar = progressBar(`Generating ${metadata.length} samples to ${filePath}...`)
        bar.start(metadata.length, 0)
        for (let i = 0; i < metadata.length; i++) {
            const sample = await Sample.compute(config, i + startCandleIndex)
            await fs.appendFile(filePath, sample.rawAll)
            bar.update(i + 1)
        }
        bar.stop()
    }
}
module.exports = Samples
