import fs from 'fs'
import path from 'path'
import Trade from '../core/Trade.js'
import TradeOutcome from '../core/TradeOutcome.js'
import Trades from './Trades.js'
import FilePart from '../utils/FilePart.js'
import { dateStr, nextDay, compareDates } from '../utils/date.js'
import { getFilePath } from '../utils/storage.js'

const RECORD_SIZE = 48

export default class TradeOutcomes {
    #dataDir
    #symbol
    #tpPercent
    #slPercent
    #openTradeStore
    #closeTradeStore
    #filePart
    #onProgress

    constructor (dataDir, symbol, { tpPercent, slPercent, onProgress }) {
        if (!symbol.exchange) throw new Error('Symbol must belong to an exchange')
        if (tpPercent <= 0) throw new Error('tpPercent must be positive')
        if (slPercent <= 0) throw new Error('slPercent must be positive')
        this.#dataDir = dataDir
        this.#symbol = symbol
        this.#tpPercent = tpPercent
        this.#slPercent = slPercent
        this.#openTradeStore = new Trades(dataDir, symbol)
        this.#closeTradeStore = new Trades(dataDir, symbol)
        this.#filePart = null
        this.#onProgress = onProgress || null
    }

    #getFilePath (year, month, day) {
        return getFilePath(this.#dataDir, 'outcomes', this.#symbol, year, month, day,
            `tp${this.#tpPercent}_sl${this.#slPercent}`)
    }

    async #ensureDayAsync (year, month, day) {
        const file = this.#getFilePath(year, month, day)
        try {
            await fs.promises.access(file)
            return
        } catch {}

        const isTargetDay = (trade) => {
            const d = new Date(Math.floor(trade.tsUs / 1000))
            return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day
        }

        const outcomes = []
        const pending = []
        const tradeStore = new Trades(this.#dataDir, this.#symbol)
        let currentDay = { year, month, day }
        let trades = await tradeStore.readArrayAsync(currentDay.year, currentDay.month, currentDay.day,
            currentDay.year, currentDay.month, currentDay.day)

        const progressInfo = {
            requestedDay: { year, month, day },
            scanningDay: currentDay,
            scanningDayIndex: 0,
            totalOutcomes: trades.length,
            pendingTradesCount: 0,
            resolvedTradesCount: 0
        }

        while (trades.length > 0) {
            for (let i = 0; i < trades.length; i++) {
                const trade = trades[i]

                // Open new outcome if trade belongs to the requested day
                if (isTargetDay(trade)) {
                    const outcome = new TradeOutcome({
                        tpPercent: this.#tpPercent,
                        slPercent: this.#slPercent,
                        trade
                    })
                    outcomes.push(outcome)
                    pending.push(outcome)
                }

                // Feed trade into all pending outcomes
                for (let j = 0; j < pending.length; j++) {
                    if (pending[j].update(trade)) {
                        pending.splice(j, 1)
                        j--
                    }
                }
                if (pending.length === 0) break

                if (this.#onProgress) {
                    progressInfo.scanningDay = currentDay
                    progressInfo.scanningDayIndex = i
                    progressInfo.pendingTradesCount = pending.length
                    progressInfo.resolvedTradesCount = outcomes.length - pending.length
                    this.#onProgress(progressInfo)
                }
            }

            if (pending.length === 0) break
            currentDay = nextDay(currentDay.year, currentDay.month, currentDay.day)
            trades = await tradeStore.readArrayAsync(currentDay.year, currentDay.month, currentDay.day,
                currentDay.year, currentDay.month, currentDay.day)
        }
        if (this.#onProgress) {
            progressInfo.scanningDay = { year, month, day }
            progressInfo.totalOutcomes = outcomes.length
            progressInfo.pendingTradesCount = pending.length
            progressInfo.resolvedTradesCount = outcomes.length - pending.length
            progressInfo.done = true
            this.#onProgress(progressInfo)
        }

        // Save only completed outcomes, sorted by open tsUs
        const completed = outcomes.filter(o => o.completed)
        completed.sort((a, b) => a.longOrder.open.tsUs - b.longOrder.open.tsUs)
        const buf = Buffer.allocUnsafe(completed.length * RECORD_SIZE)
        for (let i = 0; i < completed.length; i++) {
            const off = i * RECORD_SIZE
            const o = completed[i]
            const lo = o.longOrder
            const so = o.shortOrder
            buf.writeBigUInt64LE(BigInt(lo.open.tsUs), off)
            buf.writeBigUInt64LE(BigInt(lo.open.srcId), off + 8)
            buf.writeBigUInt64LE(BigInt(lo.close.tsUs), off + 16)
            buf.writeBigUInt64LE(BigInt(lo.close.srcId), off + 24)
            buf.writeBigUInt64LE(BigInt(so.close.tsUs), off + 32)
            buf.writeBigUInt64LE(BigInt(so.close.srcId), off + 40)
        }

        const tmpFile = file + '.tmp'
        await fs.promises.mkdir(path.dirname(file), { recursive: true })
        await fs.promises.writeFile(tmpFile, buf)
        await fs.promises.rename(tmpFile, file)
        console.log(`${dateStr(year, month, day)}: ${completed.length}/${outcomes.length} outcomes`)
    }

    async * readAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        let cur = { year: startYear, month: startMonth, day: startDay }
        const end = { year: endYear, month: endMonth, day: endDay }
        while (compareDates(cur, end) <= 0) {
            await this.#ensureDayAsync(cur.year, cur.month, cur.day)
            const filePath = this.#getFilePath(cur.year, cur.month, cur.day)
            this.#filePart = await FilePart.createAsync({ filePart: this.#filePart, filePath })
            const buf = await this.#filePart.readAsync({})
            if (buf.length >= RECORD_SIZE) {
                const count = Math.floor(buf.length / RECORD_SIZE)
                for (let i = 0; i < count; i++) {
                    const off = i * RECORD_SIZE
                    const openTsUs = Number(buf.readBigUInt64LE(off))
                    const openSrcId = Number(buf.readBigUInt64LE(off + 8))
                    const longCloseTsUs = Number(buf.readBigUInt64LE(off + 16))
                    const longCloseSrcId = Number(buf.readBigUInt64LE(off + 24))
                    const shortCloseTsUs = Number(buf.readBigUInt64LE(off + 32))
                    const shortCloseSrcId = Number(buf.readBigUInt64LE(off + 40))

                    const openTrade = await this.#openTradeStore.readAtAsync(openTsUs, openSrcId)
                    const longCloseTrade = await this.#closeTradeStore.readAtAsync(longCloseTsUs, longCloseSrcId)
                    const shortCloseTrade = await this.#closeTradeStore.readAtAsync(shortCloseTsUs, shortCloseSrcId)

                    const outcome = new TradeOutcome({
                        tpPercent: this.#tpPercent,
                        slPercent: this.#slPercent,
                        trade: openTrade
                    })
                    outcome.update(longCloseTrade)
                    outcome.update(shortCloseTrade)
                    yield outcome
                }
            }
            cur = nextDay(cur.year, cur.month, cur.day)
        }
    }

    async readArrayAsync (startYear, startMonth, startDay, endYear, endMonth, endDay) {
        const result = []
        for await (const outcome of this.readAsync(startYear, startMonth, startDay, endYear, endMonth, endDay)) {
            result.push(outcome)
        }
        return result
    }
}
