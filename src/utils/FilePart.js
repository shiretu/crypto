import fs from 'fs'
import { isMainThread } from 'worker_threads'

export default class FilePart {
    static #stats = { fullReads: 0, partialReads: 0, upgrades: 0, cacheHits: 0 }
    static #cache = new Map()

    static get stats () { return { ...FilePart.#stats } }
    static resetStats () { FilePart.#stats = { fullReads: 0, partialReads: 0, upgrades: 0, cacheHits: 0 } }

    #filePath
    #buf
    #offset
    #size
    #fileSize

    constructor (filePath) {
        this.#filePath = filePath
        this.#buf = null
        this.#offset = null
        this.#size = null
        this.#fileSize = 0
    }

    get filePath () { return this.#filePath }
    get buf () { return this.#buf }
    get offset () { return this.#offset }
    get size () { return this.#size }
    get fileSize () { return this.#fileSize }
    get loadedCompletely () { return this.#buf !== null && this.#size !== null && this.#size === this.#fileSize }

    static async createAsync ({ filePart = null, filePath }) {
        if (filePart && filePart.filePath === filePath) {
            return filePart
        }
        if (isMainThread) {
            const cached = FilePart.#cache.get(filePath)
            if (cached) return cached
        }
        try {
            await fs.promises.access(filePath, fs.constants.R_OK)
        } catch (e) {
            throw new Error(`File not found or not readable: ${filePath}`)
        }
        const fp = new FilePart(filePath)
        if (isMainThread) {
            FilePart.#cache.set(filePath, fp)
        }
        return fp
    }

    async #loadFullyAsync () {
        FilePart.#stats.fullReads++
        this.#buf = await fs.promises.readFile(this.#filePath)
        this.#offset = 0
        this.#size = this.#buf.length
        this.#fileSize = this.#buf.length
    }

    async #loadPartialAsync (offset, length) {
        FilePart.#stats.partialReads++
        this.#fileSize = (await fs.promises.stat(this.#filePath)).size
        if (length < 0) length = this.#fileSize - offset
        if (offset + length > this.#fileSize) {
            throw new Error(`Cannot read ${length} bytes at offset ${offset} (file size: ${this.#fileSize})`)
        }
        const buf = Buffer.allocUnsafe(length)
        const fh = await fs.promises.open(this.#filePath, 'r')
        try {
            await fh.read(buf, 0, length, offset)
        } finally {
            await fh.close()
        }
        this.#buf = buf
        this.#offset = offset
        this.#size = length
    }

    async readAsync ({ offset = -1, length = -1 }) {
        if (length === 0) throw new Error('length must not be 0')
        if (this.#buf === null) {
            await this.#loadFullyAsync()
            return this.#chop({ offset, length })
        }

        // Full read requested but only partially loaded — upgrade
        if (offset < 0 && !this.loadedCompletely) {
            FilePart.#stats.upgrades++
            await this.#loadFullyAsync()
            return this.#chop({ offset, length })
        }

        // Subsequent read — try to serve from loaded data
        try {
            const result = this.#chop({ offset, length })
            FilePart.#stats.cacheHits++
            return result
        } catch {
            // Loaded range insufficient — upgrade to full load
            FilePart.#stats.upgrades++
            await this.#loadFullyAsync()
            return this.#chop({ offset, length })
        }
    }

    #chop ({ offset, length }) {
        if (this.#buf === null) {
            throw new Error('Buffer not loaded')
        }
        if (offset < 0 && length < 0) return this.#buf
        if (offset < 0) offset = this.#offset
        if (length < 0) length = this.#size - (offset - this.#offset)
        if (offset < this.#offset || offset + length > this.#offset + this.#size) {
            throw new Error(`Cannot read ${length} bytes at offset ${offset} (buffer range: ${this.#offset}-${this.#offset + this.#size}, file size: ${this.#fileSize})`)
        }
        return this.#buf.subarray(offset - this.#offset, offset - this.#offset + length)
    }
}
