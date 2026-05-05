import fs from 'fs'
import { isMainThread } from 'worker_threads'

export default class CachedFile {
    static #stats = { reads: 0, cacheHits: 0 }
    static #cache = new Map()
    static #SILENCE_THRESHOLD = 5 * 60 * 1000

    static get stats () { return { ...CachedFile.#stats } }
    static resetStats () { CachedFile.#stats = { reads: 0, cacheHits: 0 } }

    static #cleanupCache () {
        const now = Date.now()
        for (const [path, fp] of CachedFile.#cache) {
            if (now - fp.#lastActivity > CachedFile.#SILENCE_THRESHOLD) {
                CachedFile.#cache.delete(path)
            }
        }
    }

    #filePath
    #buf
    #lastActivity

    constructor (filePath) {
        this.#filePath = filePath
        this.#buf = null
        this.#lastActivity = Date.now()
    }

    get filePath () { return this.#filePath }
    get lastActivity () { return this.#lastActivity }

    static async createAsync ({ filePart = null, filePath }) {
        let result = null
        try {
            if (filePart && filePart.filePath === filePath) {
                result = filePart
                return result
            }
            if (isMainThread) {
                result = CachedFile.#cache.get(filePath)
                if (result) {
                    return result
                }
            }
            try {
                await fs.promises.access(filePath, fs.constants.R_OK)
            } catch (e) {
                throw new Error(`File not found or not readable: ${filePath}`)
            }
            result = new CachedFile(filePath)
            if (isMainThread) {
                CachedFile.#cache.set(filePath, result)
            }
            return result
        } finally {
            if (result) result.#lastActivity = Date.now()
            if (isMainThread) CachedFile.#cleanupCache()
        }
    }

    async readAsync ({ offset = -1, length = -1 } = {}) {
        if (length === 0) throw new Error('length must not be 0')
        this.#lastActivity = Date.now()
        if (this.#buf === null) {
            CachedFile.#stats.reads++
            this.#buf = await fs.promises.readFile(this.#filePath)
            // console.log(`Loaded file into cache: ${this.#filePath} (size: ${this.#buf.length} bytes)`)
        } else {
            CachedFile.#stats.cacheHits++
        }
        if (offset < 0 && length < 0) return this.#buf
        if (offset < 0) offset = 0
        if (length < 0) length = this.#buf.length - offset
        if (offset + length > this.#buf.length) {
            throw new Error(`Cannot read ${length} bytes at offset ${offset} (file size: ${this.#buf.length})`)
        }
        return this.#buf.subarray(offset, offset + length)
    }
}
