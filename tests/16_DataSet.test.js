import fs from 'fs'
import path from 'path'
import { expect } from 'chai'
import DataSet from '../src/nn/DataSet.js'
import Fingerprint from '../src/utils/Fingerprint.js'

const DATASETS_ROOT = path.resolve('data', 'nn', 'datasets')
const TEST_NAME = 'testDataSet'

const sampleData = (overrides = {}) => ({
    symbol: 'binance:eth:usdc',
    candleDuration: 300,
    windowSize: 60,
    tpPercent: 1.5,
    slPercent: 1,
    randomWindowPosition: true,
    startDay: '2023-01-01',
    endDay: '2023-12-31',
    samplesCount: 1000,
    ...overrides
})

describe('DataSet', () => {
    describe('constructor validation', () => {
        it('should reject missing name', () => {
            expect(() => new DataSet()).to.throw('name is required')
        })

        it('should reject empty name', () => {
            expect(() => new DataSet('', sampleData())).to.throw('name is required')
        })

        it('should reject name with path separator', () => {
            expect(() => new DataSet('a/b', sampleData())).to.throw('name must not contain path separators')
        })

        it('should reject missing data', () => {
            expect(() => new DataSet(TEST_NAME)).to.throw('data is required')
        })

        it('should reject null data', () => {
            expect(() => new DataSet(TEST_NAME, null)).to.throw('data is required')
        })

        it('should accept a non-empty data object', () => {
            expect(() => new DataSet(TEST_NAME, sampleData())).to.not.throw()
        })

        it('should not create any filesystem artifact on construction', () => {
            const data = sampleData({ symbol: 'binance:btc:usdc' })
            const fp = Fingerprint.compute(data)
            const expectedDir = path.join(DATASETS_ROOT, TEST_NAME, fp)
            fs.rmSync(expectedDir, { recursive: true, force: true })
            // eslint-disable-next-line no-new
            new DataSet(TEST_NAME, data)
            expect(fs.existsSync(expectedDir)).to.equal(false)
        })
    })

    describe('public surface', () => {
        it('should expose name via getter', () => {
            const ds = new DataSet(TEST_NAME, sampleData())
            expect(ds.name).to.equal(TEST_NAME)
        })

        it('should expose data via getter', () => {
            const data = sampleData()
            const ds = new DataSet(TEST_NAME, data)
            expect(ds.data).to.equal(data)
        })

        it('should have geometry getters undefined before load()', () => {
            const ds = new DataSet(TEST_NAME, sampleData())
            expect(ds.samplesCount).to.equal(undefined)
            expect(ds.featuresCount).to.equal(undefined)
            expect(ds.labelsCount).to.equal(undefined)
            expect(ds.featureSize).to.equal(undefined)
            expect(ds.labelSize).to.equal(undefined)
        })

        it('should only expose load() as the public action (no produce/read/exists)', () => {
            const ds = new DataSet(TEST_NAME, sampleData())
            expect(ds.load).to.be.a('function')
            expect(ds.produce).to.equal(undefined)
            expect(ds.read).to.equal(undefined)
            expect(ds.exists).to.equal(undefined)
        })
    })

    describe('load() against a pre-existing on-disk dataset', () => {
        it('should populate geometry getters from manifest.json and return samples.bin', async () => {
            const data = sampleData({ symbol: 'binance:fake:usdc', windowSize: 3, samplesCount: 5 })
            const fp = Fingerprint.compute(data)
            const dir = path.join(DATASETS_ROOT, TEST_NAME, fp)
            fs.rmSync(dir, { recursive: true, force: true })
            fs.mkdirSync(dir, { recursive: true })

            // Manually lay out a manifest + samples.bin matching the geometry contract.
            const featuresCount = data.windowSize * 4 // OHLC per candle
            const featureSize = 4
            const labelsCount = 2
            const labelSize = 4
            const sampleSize = featuresCount * featureSize + labelsCount * labelSize
            const buf = Buffer.alloc(sampleSize * data.samplesCount)
            for (let i = 0; i < buf.length; i += 4) buf.writeFloatLE(i / 4, i)

            fs.writeFileSync(path.join(dir, 'recipe.json'), JSON.stringify(data))
            fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
                samplesCount: data.samplesCount,
                featuresCount,
                featureSize,
                labelsCount,
                labelSize
            }))
            fs.writeFileSync(path.join(dir, 'samples.bin'), buf)

            try {
                const ds = new DataSet(TEST_NAME, data)
                const returnedBuf = await ds.load()

                expect(ds.samplesCount).to.equal(data.samplesCount)
                expect(ds.featuresCount).to.equal(featuresCount)
                expect(ds.featureSize).to.equal(featureSize)
                expect(ds.labelsCount).to.equal(labelsCount)
                expect(ds.labelSize).to.equal(labelSize)
                expect(Buffer.isBuffer(returnedBuf)).to.equal(true)
                expect(returnedBuf.length).to.equal(sampleSize * data.samplesCount)
                expect(returnedBuf.readFloatLE(0)).to.equal(0)
                expect(returnedBuf.readFloatLE(4)).to.equal(1)
            } finally {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })
    })

    describe('fingerprint stability (via folder lookup)', () => {
        it('should pick the same folder for equal data objects regardless of key order', () => {
            const dataA = { a: 1, b: 2, c: { x: 1, y: 2 } }
            const dataB = { c: { y: 2, x: 1 }, b: 2, a: 1 }
            expect(Fingerprint.compute(dataA)).to.equal(Fingerprint.compute(dataB))
        })

        it('should pick different folders for differing data', () => {
            const fp1 = Fingerprint.compute(sampleData({ tpPercent: 1.5 }))
            const fp2 = Fingerprint.compute(sampleData({ tpPercent: 2.0 }))
            expect(fp1).to.not.equal(fp2)
        })
    })
})
