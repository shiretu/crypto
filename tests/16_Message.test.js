import { expect } from 'chai'
import Message from '../src/nn/Message.js'

describe('Message', () => {
    it('should encode type and payload into 8-byte header + payload', () => {
        const payload = Buffer.from([1, 2, 3, 4])
        const msg = new Message(0x01, payload)
        const buf = msg.encode()

        expect(buf.length).to.equal(12)
        expect(buf.readUInt32BE(0)).to.equal(1)
        expect(buf.readUInt32BE(4)).to.equal(4)
        expect(Buffer.compare(buf.subarray(8), payload)).to.equal(0)
    })

    it('should expose type and payload', () => {
        const payload = Buffer.from([1, 2])
        const msg = new Message(5, payload)
        expect(msg.type).to.equal(5)
        expect(Buffer.compare(msg.rawPayload, payload)).to.equal(0)
    })

    it('should decode back to a Message instance', () => {
        const payload = Buffer.from([10, 20, 30])
        const buf = new Message(42, payload).encode()
        const msg = Message.decode(buf)

        expect(msg).to.be.instanceOf(Message)
        expect(msg.type).to.equal(42)
        expect(Buffer.compare(msg.rawPayload, payload)).to.equal(0)
    })

    it('should round-trip a float64 array', () => {
        const arr = new Float64Array([1.1, 2.2, 3.3])
        const payload = Buffer.from(arr.buffer)
        const buf = new Message(1, payload).encode()
        const msg = Message.decode(buf)
        const restored = new Float64Array(msg.rawPayload.buffer, msg.rawPayload.byteOffset, msg.rawPayload.byteLength / 8)

        expect(Array.from(restored)).to.deep.equal([1.1, 2.2, 3.3])
    })

    it('should round-trip a float32 array', () => {
        const arr = new Float32Array([1.5, 2.5, 3.5])
        const payload = Buffer.from(arr.buffer)
        const buf = new Message(2, payload).encode()
        const msg = Message.decode(buf)
        const restored = new Float32Array(msg.rawPayload.buffer, msg.rawPayload.byteOffset, msg.rawPayload.byteLength / 4)

        expect(Array.from(restored)).to.deep.equal([1.5, 2.5, 3.5])
    })

    it('should round-trip an int32 array', () => {
        const arr = new Int32Array([0, 1, -1, 2147483647])
        const payload = Buffer.from(arr.buffer)
        const buf = new Message(3, payload).encode()
        const msg = Message.decode(buf)
        const restored = new Int32Array(msg.rawPayload.buffer, msg.rawPayload.byteOffset, msg.rawPayload.byteLength / 4)

        expect(Array.from(restored)).to.deep.equal([0, 1, -1, 2147483647])
    })

    it('should handle empty payload', () => {
        const buf = new Message(0, Buffer.alloc(0)).encode()
        expect(buf.length).to.equal(8)

        const msg = Message.decode(buf)
        expect(msg.type).to.equal(0)
        expect(msg.rawPayload.length).to.equal(0)
    })

    it('should handle max type value', () => {
        const buf = new Message(0xFFFFFFFF, Buffer.from([1])).encode()
        const msg = Message.decode(buf)
        expect(msg.type).to.equal(0xFFFFFFFF)
    })

    it('should reject non-uint32 type', () => {
        expect(() => new Message(-1, Buffer.alloc(0))).to.throw('uint32')
        expect(() => new Message(1.5, Buffer.alloc(0))).to.throw('uint32')
        expect(() => new Message(0x100000000, Buffer.alloc(0))).to.throw('uint32')
    })

    it('should reject non-Buffer payload', () => {
        expect(() => new Message(1, [1, 2, 3])).to.throw('rawPayload must be a Buffer')
        expect(() => new Message(1, new Uint8Array(3))).to.throw('rawPayload must be a Buffer')
    })

    it('should reject non-Buffer on decode', () => {
        expect(() => Message.decode([1, 2, 3])).to.throw('buffer must be a Buffer')
    })

    it('should reject buffer shorter than 8 bytes', () => {
        expect(() => Message.decode(Buffer.alloc(7))).to.throw('too short')
    })

    it('should reject truncated payload', () => {
        const buf = Buffer.alloc(8)
        buf.writeUInt32BE(1, 0)
        buf.writeUInt32BE(100, 4)
        expect(() => Message.decode(buf)).to.throw('Expected 100')
    })
})
