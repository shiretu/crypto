import fs from 'fs'

export default class FilePart {
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
        try {
            await fs.promises.access(filePath, fs.constants.R_OK)
        } catch (e) {
            throw new Error(`File not found or not readable: ${filePath}`)
        }
        return new FilePart(filePath)
    }

    async #loadFullyAsync () {
        this.#buf = await fs.promises.readFile(this.#filePath)
        this.#offset = 0
        this.#size = this.#buf.length
        this.#fileSize = this.#buf.length
    }

    async #loadPartialAsync (offset, length) {
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
            // First read — load fully or partially as requested
            if (offset < 0) {
                await this.#loadFullyAsync()
            } else {
                await this.#loadPartialAsync(offset, length)
            }
            return this.#chop({ offset, length })
        }

        // Full read requested but only partially loaded — upgrade
        if (offset < 0 && !this.loadedCompletely) {
            await this.#loadFullyAsync()
            return this.#chop({ offset, length })
        }

        // Subsequent read — try to serve from loaded data
        try {
            return this.#chop({ offset, length })
        } catch {
            // Loaded range insufficient — upgrade to full load
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
