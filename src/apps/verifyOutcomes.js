import { resolveSymbol } from '../core/resolveSymbol.js'
import fs from 'fs'
import path from 'path'

// ── Binary format constants ──────────────────────────────────────
const TRADE_SIZE = 32 // 8 tsUs + 8 price + 8 baseQty + 8 quoteQty
const OUTCOME_SIZE = 48 // 6 × UInt64LE fields

// ── Raw binary readers (no library classes) ──────────────────────
const readTsUs = (buf, offset) => Number(buf.readBigUInt64LE(offset) & 0x7FFFFFFFFFFFFFFFn)

const readPrice = (buf, offset) => buf.readDoubleLE(offset + 8)

const readOutcome = (buf, offset) => ({
    openTsUs: Number(buf.readBigUInt64LE(offset)),
    openDayIndex: Number(buf.readBigUInt64LE(offset + 8)),
    longTsUs: Number(buf.readBigUInt64LE(offset + 16)),
    longDayIndex: Number(buf.readBigUInt64LE(offset + 24)),
    shortTsUs: Number(buf.readBigUInt64LE(offset + 32)),
    shortDayIndex: Number(buf.readBigUInt64LE(offset + 40))
})

// ── Day arithmetic (inlined, no Day import) ──────────────────────
const US_PER_DAY = 86_400_000_000

const dayFromTsUs = (tsUs) => Math.floor(tsUs / US_PER_DAY) * US_PER_DAY

const dayToStr = (tsUs) => {
    const d = new Date(Math.floor(tsUs / 1000))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const dayFromStr = (str) => {
    const [y, m, d] = str.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d || 1)).getTime() * 1000
}

// ── Path helpers ─────────────────────────────────────────────────
const dayFilePath = (base, storeType, sym, dayTsUs, extra = []) => {
    const d = new Date(dayTsUs / 1000)
    return path.join(base, storeType,
        sym.exchange.id, sym.base.id, sym.quote.id,
        ...extra,
        String(d.getUTCFullYear()),
        String(d.getUTCMonth() + 1).padStart(2, '0'),
        `${String(d.getUTCDate()).padStart(2, '0')}.bin`
    )
}

const rawReadDay = (base, storeType, sym, dayTsUs, extra = []) => {
    const fp = dayFilePath(base, storeType, sym, dayTsUs, extra)
    try { return fs.readFileSync(fp) } catch (e) { if (e.code === 'ENOENT') return null; throw e }
}

// ── CLI ──────────────────────────────────────────────────────────
const usage = () => {
    console.error('Usage: verifyOutcomes <exchange:base:quote> <tpPercent> <slPercent> [count]')
    console.error('  count : number of random outcomes to verify (default 100)')
    process.exit(1)
}

const args = process.argv.slice(2)
if (args.length < 3) usage()

const sym = resolveSymbol(args[0])
const tpPercent = parseFloat(args[1])
const slPercent = parseFloat(args[2])
if (isNaN(tpPercent) || tpPercent <= 0) { console.error(`Invalid tpPercent: ${args[1]}`); process.exit(1) }
if (isNaN(slPercent) || slPercent <= 0) { console.error(`Invalid slPercent: ${args[2]}`); process.exit(1) }

const count = args[3] ? parseInt(args[3], 10) : 100

// ── Discover outcome .bin files ──────────────────────────────────
const outcomesDir = path.join('data', 'outcomes', sym.exchange.id, sym.base.id, sym.quote.id, `${tpPercent}`, `${slPercent}`)
const dayFiles = [] // { dayTsUs, filePath }

const findBins = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) findBins(full)
        else if (entry.name.endsWith('.bin')) {
            const parts = full.split(path.sep)
            const dd = parseInt(path.basename(parts.at(-1), '.bin'), 10)
            const mm = parseInt(parts.at(-2), 10)
            const yyyy = parseInt(parts.at(-3), 10)
            const dayTsUs = dayFromStr(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`)
            dayFiles.push({ dayTsUs, filePath: full })
        }
    }
}
try { findBins(outcomesDir) } catch (e) { if (e.code === 'ENOENT') { console.error(`No outcomes found at ${outcomesDir}`); process.exit(1) } throw e }

if (dayFiles.length === 0) { console.error('No outcome files found.'); process.exit(1) }

console.log(`Verify Outcomes ${sym.id} TP=${tpPercent}% SL=${slPercent}%`)
console.log(`Found ${dayFiles.length} outcome files`)
console.log(`Samples: ${count}`)
console.log()

// ── Trade file cache (raw buffers only) ──────────────────────────
const tradeCache = new Map()
const getTradesBuffer = (dayTsUs) => {
    if (tradeCache.has(dayTsUs)) return tradeCache.get(dayTsUs)
    const buf = rawReadDay('data', 'trades', sym, dayTsUs)
    tradeCache.set(dayTsUs, buf)
    return buf
}

let passed = 0
let failed = 0

for (let i = 0; i < count; i++) {
    // 1. Pick a random outcome file and raw-read it
    const { dayTsUs, filePath } = dayFiles[Math.floor(Math.random() * dayFiles.length)]
    const outBuf = fs.readFileSync(filePath)
    const outcomeCount = outBuf.length / OUTCOME_SIZE
    if (outcomeCount === 0) { i--; continue }

    // 2. Pick a random outcome record
    const ri = Math.floor(Math.random() * outcomeCount)
    const ref = readOutcome(outBuf, ri * OUTCOME_SIZE)

    // 3. Read the open trade from the trades file (raw)
    const openDay = dayFromTsUs(ref.openTsUs)
    const openTradesBuf = getTradesBuffer(openDay)
    if (!openTradesBuf) { console.log(`\nSKIP: no trades file for ${dayToStr(openDay)}`); i--; continue }
    const openOffset = ref.openDayIndex * TRADE_SIZE
    const openTsUs = readTsUs(openTradesBuf, openOffset)
    const openPrice = readPrice(openTradesBuf, openOffset)

    // Verify open timestamp matches
    if (openTsUs !== ref.openTsUs) {
        failed++
        console.log(`\nFAIL ${dayToStr(dayTsUs)} outcome #${ri}: open tsUs mismatch stored=${ref.openTsUs} file=${openTsUs}`)
        process.stdout.write(`\rVerified ${i + 1}/${count} (${passed} passed, ${failed} failed)    `)
        continue
    }

    // 4. Compute TP/SL limits from the raw open price
    const longTp = openPrice * (1 + tpPercent / 100)
    const longSl = openPrice * (1 - slPercent / 100)
    const shortTp = openPrice * (1 - tpPercent / 100)
    const shortSl = openPrice * (1 + slPercent / 100)

    // 5. Walk trades forward from the open trade to find the actual long/short close
    const maxCloseDay = Math.max(dayFromTsUs(ref.longTsUs), dayFromTsUs(ref.shortTsUs))
    let foundLongTsUs = null; let foundLongDayIndex = null; let foundLongPrice = null
    let foundShortTsUs = null; let foundShortDayIndex = null; let foundShortPrice = null

    for (let d = openDay; d <= maxCloseDay; d += US_PER_DAY) {
        const tBuf = getTradesBuffer(d)
        if (!tBuf) continue
        const tradeCount = tBuf.length / TRADE_SIZE
        for (let ti = 0; ti < tradeCount; ti++) {
            const tOff = ti * TRADE_SIZE
            const tTs = readTsUs(tBuf, tOff)
            if (tTs <= ref.openTsUs) continue
            const tPrice = readPrice(tBuf, tOff)

            if (foundLongTsUs === null) {
                if (tPrice >= longTp || tPrice <= longSl) {
                    foundLongTsUs = tTs
                    foundLongDayIndex = ti
                    foundLongPrice = tPrice
                }
            }
            if (foundShortTsUs === null) {
                if (tPrice <= shortTp || tPrice >= shortSl) {
                    foundShortTsUs = tTs
                    foundShortDayIndex = ti
                    foundShortPrice = tPrice
                }
            }
            if (foundLongTsUs !== null && foundShortTsUs !== null) break
        }
        if (foundLongTsUs !== null && foundShortTsUs !== null) break
    }

    // 6. Compare
    const longMatch = foundLongTsUs === ref.longTsUs && foundLongDayIndex === ref.longDayIndex
    const shortMatch = foundShortTsUs === ref.shortTsUs && foundShortDayIndex === ref.shortDayIndex

    if (longMatch && shortMatch) {
        passed++
    } else {
        failed++
        console.log(`\nFAIL ${dayToStr(dayTsUs)} outcome #${ri} open=${openPrice}@${ref.openTsUs}`)
        if (!longMatch) {
            console.log(`  LONG expected tsUs=${ref.longTsUs} dayIdx=${ref.longDayIndex}`)
            console.log(`  LONG found    tsUs=${foundLongTsUs} dayIdx=${foundLongDayIndex} price=${foundLongPrice}`)
            console.log(`  LONG limits   tp=${longTp} sl=${longSl}`)
        }
        if (!shortMatch) {
            console.log(`  SHORT expected tsUs=${ref.shortTsUs} dayIdx=${ref.shortDayIndex}`)
            console.log(`  SHORT found    tsUs=${foundShortTsUs} dayIdx=${foundShortDayIndex} price=${foundShortPrice}`)
            console.log(`  SHORT limits   tp=${shortTp} sl=${shortSl}`)
        }
    }

    process.stdout.write(`\rVerified ${i + 1}/${count} (${passed} passed, ${failed} failed)    `)
}

console.log(`\n\nResult: ${passed} passed, ${failed} failed out of ${count}`)
process.exit(failed > 0 ? 1 : 0)
