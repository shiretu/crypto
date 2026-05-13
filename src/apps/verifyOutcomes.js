import Outcomes from '../stores/Outcomes.js'
import Trades from '../stores/Trades.js'
import Outcome, { OutcomeRef, fromOutcomeRef } from '../core/Outcome.js'
import Day from '../utils/Day.js'
import { resolveSymbol } from '../core/resolveSymbol.js'
import fs from 'fs'
import path from 'path'

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

// Discover outcome files on disk and parse days from paths
const outcomesDir = path.join('data', 'outcomes', sym.exchange.id, sym.base.id, sym.quote.id, `${tpPercent}`, `${slPercent}`)
const days = []
const findBins = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) findBins(full)
        else if (entry.name.endsWith('.bin')) {
            const parts = full.split(path.sep)
            const dd = parseInt(path.basename(parts.at(-1), '.bin'), 10)
            const mm = parseInt(parts.at(-2), 10)
            const yyyy = parseInt(parts.at(-3), 10)
            days.push(Day.fromStr(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`))
        }
    }
}
try { findBins(outcomesDir) } catch (e) { if (e.code === 'ENOENT') { console.error(`No outcomes found at ${outcomesDir}`); process.exit(1) } throw e }

if (days.length === 0) { console.error('No outcome files found.'); process.exit(1) }

console.log(`Verify Outcomes ${sym.id} TP=${tpPercent}% SL=${slPercent}%`)
console.log(`Found ${days.length} outcome files`)
console.log(`Samples: ${count}`)

const outcomesStore = new Outcomes('data', sym, tpPercent, slPercent)
const tradesStore = new Trades('data', sym)
let passed = 0
let failed = 0

for (let i = 0; i < count; i++) {
    // Pick a random day
    const dayTsUs = days[Math.floor(Math.random() * days.length)]

    await outcomesStore.loadAsync(dayTsUs, dayTsUs)
    const dayOutcomes = outcomesStore.getDay(dayTsUs)
    if (dayOutcomes.length === 0) { i--; continue }

    // Pick a random outcome from that day
    const ri = Math.floor(Math.random() * dayOutcomes.length)
    const ref = dayOutcomes[ri]

    // Load trades for the open day through the max close day
    const openDay = Day.fromTsUs(ref.openTsUs)
    const maxDay = Math.max(Day.fromTsUs(ref.longTsUs), Day.fromTsUs(ref.shortTsUs))
    await tradesStore.loadAsync(openDay, maxDay)

    const expected = fromOutcomeRef(ref, tpPercent, slPercent, tradesStore)
    const openTrade = expected.openTrade

    const outcome = new Outcome(tpPercent, slPercent, openTrade)

    for (let day = openDay; day <= maxDay; day = Day.nextDay(day)) {
        const dayTrades = tradesStore.getDay(day)
        for (let ti = 0; ti < dayTrades.length; ti++) {
            if (outcome.update(dayTrades[ti])) break
        }
        if (outcome.completed) break
    }

    const longMatch = outcome.longTrade && outcome.longTrade.tsUs === expected.longTrade.tsUs && outcome.longTrade.dayIndex === expected.longTrade.dayIndex
    const shortMatch = outcome.shortTrade && outcome.shortTrade.tsUs === expected.shortTrade.tsUs && outcome.shortTrade.dayIndex === expected.shortTrade.dayIndex

    if (longMatch && shortMatch) {
        passed++
    } else {
        failed++
        console.log(`\nFAIL ${Day.toStr(dayTsUs)} outcome #${ri} open=${openTrade.price}@${openTrade.tsUs}`)
        if (!longMatch) {
            console.log(`  LONG expected tsUs=${expected.longTrade.tsUs} dayIdx=${expected.longTrade.dayIndex} price=${expected.longTrade.price}`)
            console.log(`  LONG found    tsUs=${outcome.longTrade?.tsUs} dayIdx=${outcome.longTrade?.dayIndex} price=${outcome.longTrade?.price}`)
            console.log(`  LONG limits   tp=${outcome.limits.long.tp} sl=${outcome.limits.long.sl}`)
        }
        if (!shortMatch) {
            console.log(`  SHORT expected tsUs=${expected.shortTrade.tsUs} dayIdx=${expected.shortTrade.dayIndex} price=${expected.shortTrade.price}`)
            console.log(`  SHORT found    tsUs=${outcome.shortTrade?.tsUs} dayIdx=${outcome.shortTrade?.dayIndex} price=${outcome.shortTrade?.price}`)
            console.log(`  SHORT limits   tp=${outcome.limits.short.tp} sl=${outcome.limits.short.sl}`)
        }
    }

    process.stdout.write(`\rVerified ${i + 1}/${count} (${passed} passed, ${failed} failed)    `)
}

console.log(`\n\nResult: ${passed} passed, ${failed} failed out of ${count}`)
process.exit(failed > 0 ? 1 : 0)
