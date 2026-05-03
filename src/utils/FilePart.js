import fs from 'fs'

export default class FilePart {
    #filePath
    #buf
    #offset
    #size
    #fileSize

    constructor (filePath, buf, offset, size, fileSize) {
        this.#filePath = filePath
        this.#buf = buf
        this.#offset = offset
        this.#size = size
        this.#fileSize = fileSize
    }

    get filePath () { return this.#filePath }
    get buf () { return this.#buf }
    get offset () { return this.#offset }
    get size () { return this.#size }
    get fileSize () { return this.#fileSize }

    static async readAsync (filePath, offset = -1, length = -1) {
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
        if (offset < 0) {
            const buf = await fs.promises.readFile(filePath)
            return new FilePart(filePath, buf, 0, buf.length, buf.length)
        }
        const fileSize = (await fs.promises.stat(filePath)).size
        if (length < 0) length = fileSize - offset
        if (length === 0 || offset + length > fileSize) {
            throw new Error(`Cannot read ${length} bytes at offset ${offset} (file size: ${fileSize})`)
        }
        const buf = Buffer.allocUnsafe(length)
        const fh = await fs.promises.open(filePath, 'r')
        try {
            await fh.read(buf, 0, length, offset)
        } finally {
            await fh.close()
        }
        return new FilePart(filePath, buf, offset, length, fileSize)
    }
}
