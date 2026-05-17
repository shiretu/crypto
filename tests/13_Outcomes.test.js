import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import { OutcomeRef } from '../src/core/Outcome.js'
import Outcomes from '../src/stores/Outcomes.js'
import Day from '../src/utils/Day.js'
import Exchange from '../src/core/Exchange.js'
import Symbol from '../src/core/Symbol.js'
import { getAsset } from '../src/core/assets.js'

// NOTE: Outcomes.computeDayBuffer spawns persistent worker threads with no
// shutdown path. Tests in this file deliberately avoid that code path by
// always pre-writing the outcomes day file to disk. Coverage of the
// worker-orchestration path is deferred until Outcomes exposes a dispose()
// method that can terminate its worker pool.

const sym = (() => {
    const s = new Symbol(getAsset('eth'), getAsset('usdc'))
    new Exchange('testex_o', [s], { downloadDay: async () => Buffer.alloc(0) })
    return s
})()

const day1 = Day.fromStr('2024-01-01')
const day2 = Day.fromStr('2024-01-02')
const day3 = Day.fromStr('2024-01-03')
const ORS = OutcomeRef.RECORD_SIZE
const TP = 1
const SL = 1

// Plain object → raw OutcomeRef bytes
const outcomeRecord = (openTsUs, openDayIndex, longTsUs, longDayIndex, shortTsUs, shortDayIndex) =>
    ({ openTsUs, openDayIndex, longTsUs, longDayIndex, shortTsUs, shortDayIndex })

const outcomesFilePath = (tmpDir, tpPercent, slPercent, dayTsUs) => {
    const d = new Date(dayTsUs / 1000)
    const y = String(d.getUTCFullYear())
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return path.join(tmpDir, 'outcomes', 'testex_o', 'eth', 'usdc',
        String(tpPercent), String(slPercent), y, m, `${dd}.bin`)
}

const writeOutcomesDayFile = (tmpDir, tpPercent, slPercent, dayTsUs, records) => {
    const filePath = outcomesFilePath(tmpDir, tpPercent, slPercent, dayTsUs)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const buf = Buffer.alloc(ORS * records.length)
    for (let i = 0; i < records.length; i++) {
        const r = records[i]
        const o = i * ORS
        buf.writeBigUInt64LE(BigInt(r.openTsUs), o + 0)
        buf.writeBigUInt64LE(BigInt(r.openDayIndex), o + 8)
        buf.writeBigUInt64LE(BigInt(r.longTsUs), o + 16)
        buf.writeBigUInt64LE(BigInt(r.longDayIndex), o + 24)
        buf.writeBigUInt64LE(BigInt(r.shortTsUs), o + 32)
        buf.writeBigUInt64LE(BigInt(r.shortDayIndex), o + 40)
    }
    fs.writeFileSync(filePath, buf)
}

describe('Outcomes', () => {
    let tmpDir

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcomes-test-'))
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    describe('constructor + path layout', () => {
        it('should expose tpPercent and slPercent via toAnonymousObject', () => {
            const store = new Outcomes(tmpDir, sym, TP, SL)
            const obj = store.toAnonymousObject()
            expect(obj.tpPercent).to.equal(TP)
            expect(obj.slPercent).to.equal(SL)
        })

        it('should read day files from data/outcomes/<ex>/<base>/<quote>/<tp>/<sl>/...', async () => {
            const openTsUs = day1 + 1_000_000
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [
                outcomeRecord(openTsUs, 0, openTsUs + 1, 1, openTsUs + 2, 2)
            ])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(1)
        })

        it('should keep different (tp, sl) combinations in different folders', async () => {
            const openTsUs = day1 + 1_000_000
            writeOutcomesDayFile(tmpDir, 1, 1, day1, [outcomeRecord(openTsUs, 0, openTsUs + 1, 1, openTsUs + 2, 2)])
            writeOutcomesDayFile(tmpDir, 2, 1, day1, [outcomeRecord(openTsUs, 0, openTsUs + 3, 3, openTsUs + 4, 4)])
            const s11 = new Outcomes(tmpDir, sym, 1, 1)
            const s21 = new Outcomes(tmpDir, sym, 2, 1)
            await s11.loadAsync(day1, day1)
            await s21.loadAsync(day1, day1)
            expect(s11.get(0).longTsUs).to.equal(openTsUs + 1)
            expect(s21.get(0).longTsUs).to.equal(openTsUs + 3)
        })
    })

    describe('inherited accessors over OutcomeRef records', () => {
        it('get(idx) returns an OutcomeRef with all six getters reading the correct bytes', async () => {
            const r = outcomeRecord(
                day1 + 1_000_000, 0,
                day1 + 5_000_000, 7,
                day1 + 9_000_000, 13
            )
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [r])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            const ref = store.get(0)
            expect(ref).to.be.instanceOf(OutcomeRef)
            expect(ref.openTsUs).to.equal(r.openTsUs)
            expect(ref.openDayIndex).to.equal(r.openDayIndex)
            expect(ref.longTsUs).to.equal(r.longTsUs)
            expect(ref.longDayIndex).to.equal(r.longDayIndex)
            expect(ref.shortTsUs).to.equal(r.shortTsUs)
            expect(ref.shortDayIndex).to.equal(r.shortDayIndex)
        })

        it('count reflects total outcomes across loaded days', async () => {
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [
                outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2),
                outcomeRecord(day1 + 4_000_000, 3, day1 + 5_000_000, 4, day1 + 6_000_000, 5)
            ])
            writeOutcomesDayFile(tmpDir, TP, SL, day2, [
                outcomeRecord(day2 + 1_000_000, 0, day2 + 2_000_000, 1, day2 + 3_000_000, 2)
            ])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day2)
            expect(store.count).to.equal(3)
        })

        it('getDay returns every outcome for a day', async () => {
            const r1 = outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2)
            const r2 = outcomeRecord(day1 + 4_000_000, 3, day1 + 5_000_000, 4, day1 + 6_000_000, 5)
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [r1, r2])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            const refs = store.getDay(day1)
            expect(refs).to.have.length(2)
            expect(refs[0].openTsUs).to.equal(r1.openTsUs)
            expect(refs[1].openTsUs).to.equal(r2.openTsUs)
        })

        it('findByTsUs finds an outcome by its openTsUs', async () => {
            const r1 = outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2)
            const r2 = outcomeRecord(day1 + 4_000_000, 3, day1 + 5_000_000, 4, day1 + 6_000_000, 5)
            const r3 = outcomeRecord(day1 + 7_000_000, 6, day1 + 8_000_000, 7, day1 + 9_000_000, 8)
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [r1, r2, r3])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            expect(store.findByTsUs(r1.openTsUs).openTsUs).to.equal(r1.openTsUs)
            expect(store.findByTsUs(r2.openTsUs).openTsUs).to.equal(r2.openTsUs)
            expect(store.findByTsUs(r3.openTsUs).openTsUs).to.equal(r3.openTsUs)
        })

        it('findByTsUs throws when the openTsUs is not present', async () => {
            const r1 = outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2)
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [r1])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            expect(() => store.findByTsUs(day1 + 9_999_999)).to.throw(/No record found/)
        })

        // This was the original bug that triggered this whole detour:
        // Store.getAt used `record.tsUs` which is undefined on OutcomeRef.
        it('getAt(openTsUs, dayIndex) returns the outcome at that index', async () => {
            const r1 = outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2)
            const r2 = outcomeRecord(day1 + 4_000_000, 3, day1 + 5_000_000, 4, day1 + 6_000_000, 5)
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [r1, r2])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            expect(store.getAt(r1.openTsUs, 0).longTsUs).to.equal(r1.longTsUs)
            expect(store.getAt(r2.openTsUs, 1).shortTsUs).to.equal(r2.shortTsUs)
        })

        it('getAt throws when dayIndex points at an outcome with a different openTsUs', async () => {
            const r1 = outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2)
            const r2 = outcomeRecord(day1 + 4_000_000, 3, day1 + 5_000_000, 4, day1 + 6_000_000, 5)
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [r1, r2])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            expect(() => store.getAt(r1.openTsUs, 1)).to.throw(/tsUs mismatch/)
        })
    })

    describe('firstTsUs and lastTsUs', () => {
        it('should reflect the first/last record across loaded days', async () => {
            const day1First = day1 + 1_000_000
            const day1Last = day1 + 9_000_000
            const day2First = day2 + 1_000_000
            const day2Last = day2 + 9_000_000
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [
                outcomeRecord(day1First, 0, day1First + 1, 1, day1First + 2, 2),
                outcomeRecord(day1Last, 3, day1Last + 1, 4, day1Last + 2, 5)
            ])
            writeOutcomesDayFile(tmpDir, TP, SL, day2, [
                outcomeRecord(day2First, 0, day2First + 1, 1, day2First + 2, 2),
                outcomeRecord(day2Last, 3, day2Last + 1, 4, day2Last + 2, 5)
            ])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day2)
            expect(store.firstTsUs).to.equal(day1First)
            expect(store.lastTsUs).to.equal(day2Last)
        })

        it('should be null when no days have been loaded yet', () => {
            const store = new Outcomes(tmpDir, sym, TP, SL)
            expect(store.firstTsUs).to.equal(null)
            expect(store.lastTsUs).to.equal(null)
        })
    })

    describe('loadAsync semantics', () => {
        it('should extend the loaded range on a subsequent loadAsync call', async () => {
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [
                outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2)
            ])
            writeOutcomesDayFile(tmpDir, TP, SL, day2, [
                outcomeRecord(day2 + 1_000_000, 0, day2 + 2_000_000, 1, day2 + 3_000_000, 2)
            ])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day1)
            expect(store.count).to.equal(1)
            await store.loadAsync(day2, day2)
            expect(store.count).to.equal(2)
        })

        it('should treat a present-but-empty day file as zero outcomes for that day', async () => {
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [])
            writeOutcomesDayFile(tmpDir, TP, SL, day2, [
                outcomeRecord(day2 + 1_000_000, 0, day2 + 2_000_000, 1, day2 + 3_000_000, 2)
            ])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day2)
            expect(store.count).to.equal(1)
            expect(store.firstTsUs).to.equal(day2 + 1_000_000)
        })

        it('should keep day-boundary records distinct across a multi-day load', async () => {
            const t1 = day1 + 1_000_000
            const t2 = day2 + 1_000_000
            const t3 = day3 + 1_000_000
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [outcomeRecord(t1, 0, t1 + 1, 1, t1 + 2, 2)])
            writeOutcomesDayFile(tmpDir, TP, SL, day2, [outcomeRecord(t2, 0, t2 + 1, 1, t2 + 2, 2)])
            writeOutcomesDayFile(tmpDir, TP, SL, day3, [outcomeRecord(t3, 0, t3 + 1, 1, t3 + 2, 2)])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            await store.loadAsync(day1, day3)
            expect(store.count).to.equal(3)
            expect(store.get(0).openTsUs).to.equal(t1)
            expect(store.get(1).openTsUs).to.equal(t2)
            expect(store.get(2).openTsUs).to.equal(t3)
        })
    })

    describe('onActivity events', () => {
        it('should emit readFile and loaded(source=disk) when reading an existing day file', async () => {
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [
                outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2)
            ])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            const events = []
            store.onActivity = e => events.push({ ...e })
            await store.loadAsync(day1, day1)
            expect(events.some(e => e.type === 'readFile')).to.equal(true)
            const loaded = events.find(e => e.type === 'loaded')
            expect(loaded).to.exist
            expect(loaded.source).to.equal('disk')
            expect(loaded.records).to.equal(1)
        })
    })

    describe('getRecordCount (file-size probe, no load)', () => {
        it('should return the record count without loading the day buffer', async () => {
            writeOutcomesDayFile(tmpDir, TP, SL, day1, [
                outcomeRecord(day1 + 1_000_000, 0, day1 + 2_000_000, 1, day1 + 3_000_000, 2),
                outcomeRecord(day1 + 4_000_000, 3, day1 + 5_000_000, 4, day1 + 6_000_000, 5)
            ])
            const store = new Outcomes(tmpDir, sym, TP, SL)
            const n = await store.getRecordCount(day1)
            expect(n).to.equal(2)
            expect(store.count).to.equal(0)   // nothing was loaded
        })

        it('should return 0 for a day that has no file on disk', async () => {
            const store = new Outcomes(tmpDir, sym, TP, SL)
            const n = await store.getRecordCount(day1)
            expect(n).to.equal(0)
        })
    })

    // NOTE: computeDayBuffer (worker-thread orchestration) and fromAnonymousObject
    // round-trip are not covered here. The former spawns persistent workers with no
    // shutdown path; the latter resolves the symbol via the module-private global
    // registry which only knows `binance`. Both gaps mirror the corresponding
    // omissions in 11_Trades.test.js and 12_Candles.test.js.
})
