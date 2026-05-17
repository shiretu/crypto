export default class Message {
    #type
    #rawPayload

    constructor (type, rawPayload) {
        if (!Number.isInteger(type) || type < 0 || type > 0xFFFFFFFF) {
            throw new Error('type must be a uint32')
        }
        if (!Buffer.isBuffer(rawPayload)) {
            throw new Error('rawPayload must be a Buffer')
        }
        this.#type = type
        this.#rawPayload = rawPayload
    }

    get type () { return this.#type }
    get rawPayload () { return this.#rawPayload }

    encode () {
        const buf = Buffer.allocUnsafe(8 + this.#rawPayload.length)
        buf.writeUInt32BE(this.#type, 0)
        buf.writeUInt32BE(this.#rawPayload.length, 4)
        this.#rawPayload.copy(buf, 8)
        return buf
    }

    static decode (buffer) {
        if (!Buffer.isBuffer(buffer)) {
            throw new Error('buffer must be a Buffer')
        }
        if (buffer.length < 8) {
            throw new Error('Buffer too short for header')
        }
        const type = buffer.readUInt32BE(0)
        const length = buffer.readUInt32BE(4)
        if (buffer.length < 8 + length) {
            throw new Error(`Expected ${length} raw payload bytes, got ${buffer.length - 8}`)
        }
        const rawPayload = buffer.subarray(8, 8 + length)
        return new Message(type, rawPayload)
    }
}
