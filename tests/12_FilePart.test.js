import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import FilePart from '../src/utils/FilePart.js'

describe('FilePart', () => {
    let tmpDir

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filepart-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should throw for non-existent file', async () => {
        try {
            await FilePart.readAsync(path.join(tmpDir, 'nope.bin'))
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('File not found')
        }
    })

    it('should read entire file when offset < 0', async () => {
        const data = Buffer.from([1, 2, 3, 4, 5])
        const filePath = path.join(tmpDir, 'full.bin')
        fs.writeFileSync(filePath, data)

        const fp = await FilePart.readAsync(filePath)
        expect(fp.buf).to.deep.equal(data)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(5)
        expect(fp.fileSize).to.equal(5)
        expect(fp.filePath).to.equal(filePath)
    })

    it('should read partial file at given offset and length', async () => {
        const data = Buffer.from([10, 20, 30, 40, 50])
        const filePath = path.join(tmpDir, 'partial.bin')
        fs.writeFileSync(filePath, data)

        const fp = await FilePart.readAsync(filePath, 1, 3)
        expect([...fp.buf]).to.deep.equal([20, 30, 40])
        expect(fp.offset).to.equal(1)
        expect(fp.size).to.equal(3)
        expect(fp.fileSize).to.equal(5)
    })

    it('should auto-calculate length when length is -1', async () => {
        const data = Buffer.from([1, 2, 3, 4, 5, 6])
        const filePath = path.join(tmpDir, 'auto.bin')
        fs.writeFileSync(filePath, data)

        const fp = await FilePart.readAsync(filePath, 2)
        expect([...fp.buf]).to.deep.equal([3, 4, 5, 6])
        expect(fp.size).to.equal(4)
        expect(fp.fileSize).to.equal(6)
    })

    it('should throw on zero length', async () => {
        const filePath = path.join(tmpDir, 'zero.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3]))

        try {
            await FilePart.readAsync(filePath, 0, 0)
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('Cannot read')
        }
    })

    it('should throw when offset + length exceeds file size', async () => {
        const filePath = path.join(tmpDir, 'oob.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3]))

        try {
            await FilePart.readAsync(filePath, 1, 5)
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('Cannot read')
        }
    })

    it('should read from offset 0 with explicit length', async () => {
        const data = Buffer.from([10, 20, 30, 40])
        const filePath = path.join(tmpDir, 'start.bin')
        fs.writeFileSync(filePath, data)

        const fp = await FilePart.readAsync(filePath, 0, 2)
        expect([...fp.buf]).to.deep.equal([10, 20])
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(2)
        expect(fp.fileSize).to.equal(4)
    })

    it('should handle empty file with full read', async () => {
        const filePath = path.join(tmpDir, 'empty.bin')
        fs.writeFileSync(filePath, Buffer.alloc(0))

        const fp = await FilePart.readAsync(filePath)
        expect(fp.buf.length).to.equal(0)
        expect(fp.size).to.equal(0)
        expect(fp.fileSize).to.equal(0)
    })

    it('should throw on empty file with partial read at offset 0', async () => {
        const filePath = path.join(tmpDir, 'empty2.bin')
        fs.writeFileSync(filePath, Buffer.alloc(0))

        try {
            await FilePart.readAsync(filePath, 0)
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('Cannot read')
        }
    })
})
