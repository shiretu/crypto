import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import CachedFile from '../src/utils/CachedFile.js'

describe('CachedFile', () => {
    let tmpDir

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filepart-test-'))
        CachedFile.resetStats()
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should throw for non-existent file', async () => {
        try {
            await CachedFile.createAsync({ filePath: path.join(tmpDir, 'nope.bin') })
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('File not found')
        }
    })

    it('should reuse filePart when filePath matches', async () => {
        const filePath = path.join(tmpDir, 'reuse.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3]))

        const fp = await CachedFile.createAsync({ filePath })
        const fp2 = await CachedFile.createAsync({ filePart: fp, filePath })
        expect(fp2).to.equal(fp)
    })

    it('should create new filePart when filePath differs', async () => {
        const file1 = path.join(tmpDir, 'a.bin')
        const file2 = path.join(tmpDir, 'b.bin')
        fs.writeFileSync(file1, Buffer.from([1, 2, 3]))
        fs.writeFileSync(file2, Buffer.from([4, 5, 6]))

        const fp = await CachedFile.createAsync({ filePath: file1 })
        const fp2 = await CachedFile.createAsync({ filePart: fp, filePath: file2 })
        expect(fp2).to.not.equal(fp)
        expect(fp2.filePath).to.equal(file2)
    })

    it('should read full file', async () => {
        const data = Buffer.from([1, 2, 3, 4, 5])
        const filePath = path.join(tmpDir, 'full.bin')
        fs.writeFileSync(filePath, data)

        const fp = await CachedFile.createAsync({ filePath })
        const buf = await fp.readAsync({})
        expect(buf).to.deep.equal(data)
    })

    it('should read sub-buffer with offset and length', async () => {
        const filePath = path.join(tmpDir, 'sub.bin')
        fs.writeFileSync(filePath, Buffer.from([10, 20, 30, 40, 50]))

        const fp = await CachedFile.createAsync({ filePath })
        const buf = await fp.readAsync({ offset: 1, length: 3 })
        expect([...buf]).to.deep.equal([20, 30, 40])
    })

    it('should read from offset to end with auto length', async () => {
        const filePath = path.join(tmpDir, 'auto.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3, 4, 5, 6]))

        const fp = await CachedFile.createAsync({ filePath })
        const buf = await fp.readAsync({ offset: 2 })
        expect([...buf]).to.deep.equal([3, 4, 5, 6])
    })

    it('should serve from cache on repeat reads', async () => {
        const filePath = path.join(tmpDir, 'cache.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3, 4, 5]))

        const fp = await CachedFile.createAsync({ filePath })
        await fp.readAsync({})
        await fp.readAsync({})
        await fp.readAsync({ offset: 1, length: 2 })
        expect(CachedFile.stats.reads).to.equal(1)
        expect(CachedFile.stats.cacheHits).to.equal(2)
    })

    it('should throw on zero length', async () => {
        const filePath = path.join(tmpDir, 'zero.bin')
        fs.writeFileSync(filePath, Buffer.from([1, 2, 3]))

        const fp = await CachedFile.createAsync({ filePath })
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

        const fp = await CachedFile.createAsync({ filePath })
        try {
            await fp.readAsync({ offset: 1, length: 5 })
            expect.fail('should have thrown')
        } catch (e) {
            expect(e.message).to.include('Cannot read')
        }
    })

    it('should handle empty file', async () => {
        const filePath = path.join(tmpDir, 'empty.bin')
        fs.writeFileSync(filePath, Buffer.alloc(0))

        const fp = await CachedFile.createAsync({ filePath })
        const buf = await fp.readAsync({})
        expect(buf.length).to.equal(0)
    })
})
