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

    it('should throw loadAsync for non-existent file', async () => {
        try {
            await FilePart.createAsync({ filePath: path.join(tmpDir, 'nope.bin') })
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('File not found')
        }
    })

    it('should reuse filePart when filePath matches', async () => {
        const filePath = path.join(tmpDir, 'reuse.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3]))

        const fp = await FilePart.createAsync({ filePath })
        const fp2 = await FilePart.createAsync({ filePart: fp, filePath })
        expect(fp2).to.equal(fp)
    })

    it('should create new filePart when filePath differs', async () => {
        const file1 = path.join(tmpDir, 'a.bin')
        const file2 = path.join(tmpDir, 'b.bin')
        fs.writeFileSync(file1, Buffer.from([1, 2, 3]))
        fs.writeFileSync(file2, Buffer.from([4, 5, 6]))

        const fp = await FilePart.createAsync({ filePath: file1 })
        const fp2 = await FilePart.createAsync({ filePart: fp, filePath: file2 })
        expect(fp2).to.not.equal(fp)
        expect(fp2.filePath).to.equal(file2)
    })

    it('case 1: full read on first access', async () => {
        const data = Buffer.from([1, 2, 3, 4, 5])
        const filePath = path.join(tmpDir, 'full.bin')
        fs.writeFileSync(filePath, data)

        const fp = await FilePart.createAsync({ filePath })
        expect(fp.filePath).to.equal(filePath)
        expect(fp.buf).to.equal(null)
        expect(fp.offset).to.equal(null)
        expect(fp.size).to.equal(null)
        expect(fp.fileSize).to.equal(0)
        expect(fp.loadedCompletely).to.equal(false)

        const buf = await fp.readAsync({})
        expect(buf).to.deep.equal(data)
        expect(fp.filePath).to.equal(filePath)
        expect(fp.buf).to.deep.equal(data)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(5)
        expect(fp.fileSize).to.equal(5)
        expect(fp.loadedCompletely).to.equal(true)
    })

    it('should read sub-buffer on first access (partial load)', async () => {
        const filePath = path.join(tmpDir, 'partial.bin')
        fs.writeFileSync(filePath, Buffer.from([10, 20, 30, 40, 50]))

        const fp = await FilePart.createAsync({ filePath })
        const buf = await fp.readAsync({ offset: 1, length: 3 })
        expect([...buf]).to.deep.equal([20, 30, 40])
        expect(fp.loadedCompletely).to.equal(false)
        expect(fp.size).to.equal(3)
        expect(fp.offset).to.equal(1)
        expect(fp.fileSize).to.equal(5)
    })

    it('should read from offset to end with auto length (partial load)', async () => {
        const filePath = path.join(tmpDir, 'auto.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3, 4, 5, 6]))

        const fp = await FilePart.createAsync({ filePath })
        const buf = await fp.readAsync({ offset: 2 })
        expect([...buf]).to.deep.equal([3, 4, 5, 6])
        expect(fp.filePath).to.equal(filePath)
        expect(fp.loadedCompletely).to.equal(false)
        expect(fp.offset).to.equal(2)
        expect(fp.size).to.equal(4)
        expect(fp.fileSize).to.equal(6)
    })

    it('should upgrade to full load when second read misses', async () => {
        const filePath = path.join(tmpDir, 'upgrade.bin')
        fs.writeFileSync(filePath, Buffer.from([10, 20, 30, 40, 50]))

        const fp = await FilePart.createAsync({ filePath })
        const buf1 = await fp.readAsync({ offset: 0, length: 2 })
        expect([...buf1]).to.deep.equal([10, 20])
        expect(fp.loadedCompletely).to.equal(false)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(2)
        expect(fp.fileSize).to.equal(5)

        const buf2 = await fp.readAsync({ offset: 3, length: 2 })
        expect([...buf2]).to.deep.equal([40, 50])
        expect(fp.loadedCompletely).to.equal(true)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(5)
        expect(fp.fileSize).to.equal(5)
    })

    it('should serve from partial load when second read fits', async () => {
        const filePath = path.join(tmpDir, 'fit.bin')
        fs.writeFileSync(filePath, Buffer.from([10, 20, 30, 40, 50]))

        const fp = await FilePart.createAsync({ filePath })
        await fp.readAsync({ offset: 1, length: 3 })
        expect(fp.loadedCompletely).to.equal(false)
        expect(fp.offset).to.equal(1)
        expect(fp.size).to.equal(3)
        expect(fp.fileSize).to.equal(5)

        const buf = await fp.readAsync({ offset: 2, length: 1 })
        expect([...buf]).to.deep.equal([30])
        expect(fp.loadedCompletely).to.equal(false)
        expect(fp.offset).to.equal(1)
        expect(fp.size).to.equal(3)
        expect(fp.fileSize).to.equal(5)
    })

    it('should serve full read from memory on repeat', async () => {
        const filePath = path.join(tmpDir, 'mem.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3, 4, 5]))

        const fp = await FilePart.createAsync({ filePath })
        const buf1 = await fp.readAsync({})
        const buf2 = await fp.readAsync({})
        expect(buf1).to.equal(buf2)
        expect(fp.loadedCompletely).to.equal(true)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(5)
        expect(fp.fileSize).to.equal(5)
    })

    it('should serve sub-buffer after full read', async () => {
        const filePath = path.join(tmpDir, 'sub.bin')
        fs.writeFileSync(filePath, Buffer.from([10, 20, 30, 40, 50]))

        const fp = await FilePart.createAsync({ filePath })
        await fp.readAsync({})
        const buf = await fp.readAsync({ offset: 1, length: 3 })
        expect([...buf]).to.deep.equal([20, 30, 40])
    })

    it('should throw on zero length', async () => {
        const filePath = path.join(tmpDir, 'zero.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3]))

        const fp = await FilePart.createAsync({ filePath })
        try {
            await fp.readAsync({ offset: 0, length: 0 })
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('length must not be 0')
        }
    })

    it('should throw when offset + length exceeds file size', async () => {
        const filePath = path.join(tmpDir, 'oob.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3]))

        const fp = await FilePart.createAsync({ filePath })
        try {
            await fp.readAsync({ offset: 1, length: 5 })
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('Cannot read')
        }
    })

    it('should handle empty file with full read', async () => {
        const filePath = path.join(tmpDir, 'empty.bin')
        fs.writeFileSync(filePath, Buffer.alloc(0))

        const fp = await FilePart.createAsync({ filePath })
        const buf = await fp.readAsync({})
        expect(buf.length).to.equal(0)
        expect(fp.loadedCompletely).to.equal(true)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(0)
        expect(fp.fileSize).to.equal(0)
    })

    it('should return empty buffer for empty file with offset 0', async () => {
        const filePath = path.join(tmpDir, 'empty2.bin')
        fs.writeFileSync(filePath, Buffer.alloc(0))

        const fp = await FilePart.createAsync({ filePath })
        const buf = await fp.readAsync({ offset: 0 })
        expect(buf.length).to.equal(0)
        expect(fp.loadedCompletely).to.equal(true)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(0)
        expect(fp.fileSize).to.equal(0)
    })

    it('partial read lifecycle: empty → partial → hit → miss → fully loaded', async () => {
        const filePath = path.join(tmpDir, 'lifecycle.bin')
        fs.writeFileSync(filePath, Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]))

        // Step 1: fresh FilePart, partial read
        const fp = await FilePart.createAsync({ filePath })
        expect(fp.buf).to.equal(null)

        const buf1 = await fp.readAsync({ offset: 2, length: 4 })
        expect([...buf1]).to.deep.equal([30, 40, 50, 60])
        expect(fp.loadedCompletely).to.equal(false)
        expect(fp.offset).to.equal(2)
        expect(fp.size).to.equal(4)

        // Step 2: second read fully within loaded range — no I/O
        const buf2 = await fp.readAsync({ offset: 3, length: 2 })
        expect([...buf2]).to.deep.equal([40, 50])
        expect(fp.loadedCompletely).to.equal(false)

        // Step 3: read at exact start boundary of loaded range
        const buf3 = await fp.readAsync({ offset: 2, length: 1 })
        expect([...buf3]).to.deep.equal([30])
        expect(fp.loadedCompletely).to.equal(false)

        // Step 4: read at exact end boundary of loaded range
        const buf4 = await fp.readAsync({ offset: 5, length: 1 })
        expect([...buf4]).to.deep.equal([60])
        expect(fp.loadedCompletely).to.equal(false)

        // Step 5: read outside loaded range — triggers full load
        const buf5 = await fp.readAsync({ offset: 0, length: 2 })
        expect([...buf5]).to.deep.equal([10, 20])
        expect(fp.loadedCompletely).to.equal(true)
        expect(fp.fileSize).to.equal(8)

        // Step 6: now fully loaded, any range works from memory
        const buf6 = await fp.readAsync({ offset: 6, length: 2 })
        expect([...buf6]).to.deep.equal([70, 80])
        expect(fp.loadedCompletely).to.equal(true)
    })

    it('partial read miss at start of loaded range triggers full load', async () => {
        const filePath = path.join(tmpDir, 'miss-start.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3, 4, 5, 6]))

        const fp = await FilePart.createAsync({ filePath })
        await fp.readAsync({ offset: 3, length: 3 })
        expect(fp.loadedCompletely).to.equal(false)

        const buf = await fp.readAsync({ offset: 1, length: 4 })
        expect([...buf]).to.deep.equal([2, 3, 4, 5])
        expect(fp.loadedCompletely).to.equal(true)
    })

    it('partial read miss at end of loaded range triggers full load', async () => {
        const filePath = path.join(tmpDir, 'miss-end.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3, 4, 5, 6]))

        const fp = await FilePart.createAsync({ filePath })
        await fp.readAsync({ offset: 0, length: 3 })
        expect(fp.loadedCompletely).to.equal(false)

        const buf = await fp.readAsync({ offset: 2, length: 3 })
        expect([...buf]).to.deep.equal([3, 4, 5])
        expect(fp.loadedCompletely).to.equal(true)
    })

    it('full read after partial loads entire file', async () => {
        const filePath = path.join(tmpDir, 'full-after.bin')
        fs.writeFileSync(filePath, Buffer.from([10, 20, 30, 40]))

        const fp = await FilePart.createAsync({ filePath })
        await fp.readAsync({ offset: 1, length: 2 })
        expect(fp.loadedCompletely).to.equal(false)
        expect(fp.offset).to.equal(1)
        expect(fp.size).to.equal(2)
        expect(fp.fileSize).to.equal(4)

        const buf = await fp.readAsync({})
        expect([...buf]).to.deep.equal([10, 20, 30, 40])
        expect(fp.loadedCompletely).to.equal(true)
        expect(fp.offset).to.equal(0)
        expect(fp.size).to.equal(4)
        expect(fp.fileSize).to.equal(4)
    })
})
