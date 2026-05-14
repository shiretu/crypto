import fs from 'fs'
import path from 'path'
import Fingerprint from '../utils/Fingerprint.js'
import Day from '../utils/Day.js'
import { resolveSymbol } from '../core/resolveSymbol.js'
import Trades from '../stores/Trades.js'
import Candles from '../stores/Candles.js'
import Outcomes from '../stores/Outcomes.js'
import { fromCandleRef } from '../core/Candle.js'
import { fromOutcomeRef } from '../core/Outcome.js'
import Normalisers from './Normalisers.js'

export default class DataSet {
    static #ROOT_DIR = path.resolve('data', 'nn', 'datasets')

    #data
    #fingerprint
    #rootPath
    #samplesCount
    #featuresCount
    #labelsCount
    #featureSize
    #labelSize

    constructor (data) {
        if (!data) throw new Error('data is required')
        this.#data = data
        this.#fingerprint = Fingerprint.compute(data)
        this.#rootPath = path.join(DataSet.#ROOT_DIR, this.#fingerprint)
    }

    get data () { return this.#data }
    get samplesCount () { return this.#samplesCount }
    get featuresCount () { return this.#featuresCount }
    get labelsCount () { return this.#labelsCount }
    get featureSize () { return this.#featureSize } // bytes per feature
    get labelSize () { return this.#labelSize } // bytes per label

    // Returns the dataset, producing it on disk first if it isn't there yet.
    async load () {
        if (!this.#exists()) await this.#produce()
        return await this.#read()
    }

    // True if data/nn/datasets/<fingerprint>/ already contains a produced dataset.
    // A produced dataset is identified by the presence of manifest.json + samples.bin.
    #exists () {
        return fs.existsSync(path.join(this.#rootPath, 'manifest.json')) &&
            fs.existsSync(path.join(this.#rootPath, 'samples.bin'))
    }

    // Generate the dataset from scratch and persist it under #rootPath.
    // Naive v1: load candles for symbol over [startDay, endDay], iterate (sequentially or randomly)
    // through trigger candles, build a window of windowSize OHLC candles ending at the trigger,
    // look up outcome at the trigger candle's close trade, emit [features..., longWon, shortWon].
    async #produce () {
        const {
            symbol: symbolId,
            candleDuration,
            windowSize,
            tpPercent,
            slPercent,
            randomWindowPosition,
            startDay,
            endDay,
            samplesCount: wantedSamplesCount,
            normalisationFunction
        } = this.#data

        if (!Object.hasOwn(Normalisers, normalisationFunction) ||
            typeof Normalisers[normalisationFunction] !== 'function') {
            throw new Error(`Unknown normalisationFunction: ${normalisationFunction}`)
        }
        const normalise = Normalisers[normalisationFunction]

        // `samplesCount` is treated as "the cap on good samples to collect".
        // null / undefined / 0 / negative all mean "take everything the
        // trigger pool yields" — useful for one-shot full-range datasets.
        const takeAll = wantedSamplesCount == null || wantedSamplesCount <= 0

        const symbol = resolveSymbol(symbolId)
        const startTsUs = Day.fromStr(startDay)
        const endTsUs = Day.fromStr(endDay)

        const tradesStore = new Trades('data', symbol)
        await tradesStore.loadAsync(startTsUs, endTsUs)
        const candlesStore = new Candles('data', symbol, candleDuration, tradesStore)
        await candlesStore.loadAsync(startTsUs, endTsUs)
        const outcomesStore = new Outcomes('data', symbol, tpPercent, slPercent)
        await outcomesStore.loadAsync(startTsUs, endTsUs)

        // Build the candidate trigger pool over the full loaded range, then walk
        // it (shuffled or sequential) until we've collected `wantedSamplesCount`
        // good samples. A trigger is rejected — without building the full window
        // — as soon as we encounter an empty (gap-filler) candle inside it.
        const triggerPool = Array.from(
            { length: candlesStore.count - windowSize },
            (_, i) => i + windowSize
        )
        if (randomWindowPosition) {
            for (let i = triggerPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                ;[triggerPool[i], triggerPool[j]] = [triggerPool[j], triggerPool[i]]
            }
        }

        const samples = []
        for (const triggerIdx of triggerPool) {
            if (!takeAll && samples.length >= wantedSamplesCount) break
            const windowStart = triggerIdx - windowSize

            // Build the window. Abandon the moment we hit an empty candle:
            // its prices are null and its baseVolume/tradeCount are 0, both
            // of which would crash or be refused downstream.
            const candles = []
            let aborted = false
            for (let i = 0; i < windowSize; i++) {
                const candle = fromCandleRef(candlesStore.get(windowStart + i), candleDuration, tradesStore)
                if (candle.isEmpty) { aborted = true; break }
                candles.push(candle)
            }
            if (aborted) continue

            // Hydrate the outcome at the trigger candle's close trade.
            // ensureTrades pulls the close-trade days into tradesStore (TP/SL
            // can resolve past endDay); fromOutcomeRef then does the three
            // sync lookups. Any throw here is a real integrity bug.
            const openTrade = candles.at(-1).close
            const outcomeRef = outcomesStore.getAt(openTrade.tsUs, openTrade.dayIndex)
            await outcomeRef.ensureTrades(tradesStore)
            const outcome = fromOutcomeRef(outcomeRef, tpPercent, slPercent, tradesStore)
            samples.push({ candles, outcome })
        }

        // ── Normalize and serialize ──────────────────────────────────
        // The recipe-selected Normalisers.<normalisationFunction> produces
        // the complete on-disk record for each sample:
        //     { features: number[], labels: number[] }
        // DataSet is intentionally agnostic about what those floats mean — it
        // takes featuresCount/labelsCount from the first successful sample
        // and writes features-then-labels into samples.bin (little-endian
        // float32). A normaliser may throw to refuse a sample, in which case
        // we silently drop it.
        const FLOAT_SIZE = 4
        let featuresCount = 0
        let labelsCount = 0
        let sampleBytes = 0
        let buf = null
        let offset = 0
        let writtenSamples = 0
        for (const sample of samples) {
            let result
            try {
                result = normalise(sample)
            } catch {
                continue
            }
            const { features, labels } = result
            if (buf === null) {
                featuresCount = features.length
                labelsCount = labels.length
                sampleBytes = (featuresCount + labelsCount) * FLOAT_SIZE
                // Worst-case alloc; we slice down at the end.
                buf = Buffer.alloc(sampleBytes * samples.length)
            }
            for (let i = 0; i < features.length; i++) {
                buf.writeFloatLE(features[i], offset); offset += FLOAT_SIZE
            }
            for (let i = 0; i < labels.length; i++) {
                buf.writeFloatLE(labels[i], offset); offset += FLOAT_SIZE
            }
            writtenSamples++
        }
        const trimmedBuf = buf === null
            ? Buffer.alloc(0)
            : buf.subarray(0, writtenSamples * sampleBytes)

        // ── Persist ──────────────────────────────────────────────────
        fs.mkdirSync(this.#rootPath, { recursive: true })
        fs.writeFileSync(path.join(this.#rootPath, 'recipe.json'), JSON.stringify(this.#data, null, 2))
        fs.writeFileSync(path.join(this.#rootPath, 'manifest.json'), JSON.stringify({
            samplesCount: writtenSamples,
            featuresCount,
            featureSize: FLOAT_SIZE,
            labelsCount,
            labelSize: FLOAT_SIZE
        }, null, 2))
        fs.writeFileSync(path.join(this.#rootPath, 'samples.bin'), trimmedBuf)
    }

    // Read a previously produced dataset from #rootPath.
    // Loads manifest.json into geometry getters and returns the samples.bin Buffer.
    async #read () {
        const manifest = JSON.parse(fs.readFileSync(path.join(this.#rootPath, 'manifest.json'), 'utf8'))
        this.#samplesCount = manifest.samplesCount
        this.#featuresCount = manifest.featuresCount
        this.#featureSize = manifest.featureSize
        this.#labelsCount = manifest.labelsCount
        this.#labelSize = manifest.labelSize
        return fs.readFileSync(path.join(this.#rootPath, 'samples.bin'))
    }
}
