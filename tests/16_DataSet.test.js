import fs from 'fs'
import path from 'path'
import { expect } from 'chai'
import DataSet from '../src/nn/DataSet.js'
import Fingerprint from '../src/utils/Fingerprint.js'

const DATASETS_ROOT = path.resolve('data', 'nn', 'datasets')

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
        it('should reject missing data', () => {
            expect(() => new DataSet()).to.throw('data is required')
        })

        it('should reject null data', () => {
            expect(() => new DataSet(null)).to.throw('data is required')
        })

        it('should accept a non-empty data object', () => {
            expect(() => new DataSet(sampleData())).to.not.throw()
        })

        it('should not create any filesystem artifact on construction', () => {
            const data = sampleData({ symbol: 'binance:btc:usdc' })
            const fp = Fingerprint.compute(data)
            const expectedDir = path.join(DATASETS_ROOT, fp)
            fs.rmSync(expectedDir, { recursive: true, force: true })
            // eslint-disable-next-line no-new
            new DataSet(data)
            expect(fs.existsSync(expectedDir)).to.equal(false)
        })
    })

    describe('public surface', () => {
        it('should expose data via getter', () => {
            const data = sampleData()
            const ds = new DataSet(data)
            expect(ds.data).to.equal(data)
        })

        it('should have geometry getters undefined before load()', () => {
            const ds = new DataSet(sampleData())
            expect(ds.samplesCount).to.equal(undefined)
            expect(ds.featuresCount).to.equal(undefined)
            expect(ds.labelsCount).to.equal(undefined)
            expect(ds.featureSize).to.equal(undefined)
            expect(ds.labelSize).to.equal(undefined)
        })

        it('should only expose load() as the public action (no produce/read/exists)', () => {
            const ds = new DataSet(sampleData())
            expect(ds.load).to.be.a('function')
            expect(ds.produce).to.equal(undefined)
            expect(ds.read).to.equal(undefined)
            expect(ds.exists).to.equal(undefined)
        })
    })

    describe('load() stub behaviour', () => {
        it('should throw "#produce() not implemented" when the dataset folder is missing', async () => {
            const data = sampleData({ symbol: 'binance:sol:usdc' })
            const fp = Fingerprint.compute(data)
            fs.rmSync(path.join(DATASETS_ROOT, fp), { recursive: true, force: true })
            const ds = new DataSet(data)
            try {
                await ds.load()
                expect.fail('expected load() to throw')
            } catch (err) {
                expect(err.message).to.match(/#produce\(\) not implemented/)
            }
        })

        it('should throw "#read() not implemented" when the dataset folder already exists', async () => {
            const data = sampleData({ symbol: 'binance:ada:usdc' })
            const fp = Fingerprint.compute(data)
            const dir = path.join(DATASETS_ROOT, fp)
            fs.mkdirSync(dir, { recursive: true })
            try {
                const ds = new DataSet(data)
                try {
                    await ds.load()
                    expect.fail('expected load() to throw')
                } catch (err) {
                    expect(err.message).to.match(/#read\(\) not implemented/)
                }
            } finally {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })
    })

    describe('fingerprint stability (via folder lookup)', () => {
        it('should pick the same folder for equal data objects regardless of key order', async () => {
            const dataA = { a: 1, b: 2, c: { x: 1, y: 2 } }
            const dataB = { c: { y: 2, x: 1 }, b: 2, a: 1 }
            const fpA = Fingerprint.compute(dataA)
            const fpB = Fingerprint.compute(dataB)
            expect(fpA).to.equal(fpB)
            // Pre-create the folder so load() reaches the #read() stub for both.
            const dir = path.join(DATASETS_ROOT, fpA)
            fs.mkdirSync(dir, { recursive: true })
            try {
                const dsA = new DataSet(dataA)
                const dsB = new DataSet(dataB)
                await dsA.load().catch(e => expect(e.message).to.match(/#read\(\) not implemented/))
                await dsB.load().catch(e => expect(e.message).to.match(/#read\(\) not implemented/))
            } finally {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })

        it('should pick different folders for differing data', () => {
            const fp1 = Fingerprint.compute(sampleData({ tpPercent: 1.5 }))
            const fp2 = Fingerprint.compute(sampleData({ tpPercent: 2.0 }))
            expect(fp1).to.not.equal(fp2)
        })
    })
})
