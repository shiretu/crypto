const Csv = require('../../utils/Csv')
const { cache } = require('../common/Cache')
const paths = require('../common/paths')
const { progressBar } = require('../common/progressBar')
const { loadConfig } = require('../config')
const { createModel } = require('../nns/createModel')

// 0 = BUY, 1 = SELL, 2 = HOLD
const decisionNames = ['BUY', 'SELL', 'HOLD']

/**
 * Derive the ground-truth decision (0=BUY, 1=SELL, 2=HOLD).
 *
 * Preferred source: the classification head that was used during training.
 *   - inferenceResult.actual.classification is expected to be a length-3
 *     one-hot or probability vector [pBUY, pSELL, pHOLD].
 *   - We take argmax over that.
 *
 * Fallback source (if actual classification is missing): recompute from
 * the sample's outputs using the PnL-based rule:
 *   outputs[0] -> BUY trade, outputs[1] -> SELL trade, choose the side
 *   with larger profitPercent if it exceeds pnlThreshold, else HOLD.
 *
 * @param {object} inferenceResult  Full inference object returned by model.inference(sample).
 * @param {object} sample           Original Sample instance (for fallback).
 * @param {number} pnlThreshold     Minimum PnL to consider BUY/SELL (else HOLD).
 * @returns {number|null}           0=BUY, 1=SELL, 2=HOLD, or null if unavailable.
 */
function getGroundTruthDecision (inferenceResult, sample, pnlThreshold = 0) {
    if (inferenceResult && inferenceResult.actual && Array.isArray(inferenceResult.actual.classification)) {
        return getPredictedDecisionFromArray(inferenceResult.actual.classification)
    }

    if (!sample || !sample.outputs || sample.outputs.length < 2) return null

    const outputs = sample.outputs
    const buyOut = outputs[0]
    const sellOut = outputs[1]

    const buyPnL = buyOut.profitPercent
    const sellPnL = sellOut.profitPercent

    if (!Number.isFinite(buyPnL) || !Number.isFinite(sellPnL)) return null

    const bestPnL = Math.max(buyPnL, sellPnL)
    if (bestPnL <= pnlThreshold) return 2 // HOLD

    return buyPnL >= sellPnL ? 0 : 1
}

function getPredictedDecisionFromArray (values) {
    if (!Array.isArray(values) || values.length === 0) return null

    let bestIdx = 0
    let bestVal = values[0]

    for (let i = 1; i < values.length; i++) {
        if (values[i] > bestVal) {
            bestVal = values[i]
            bestIdx = i
        }
    }

    return bestIdx
}

/**
 * Extract the model's predicted decision (0=BUY, 1=SELL, 2=HOLD).
 *
 * This helper is intentionally flexible so it can adapt to whatever
 * `hybridDecisionRule` returns without needing to rewrite this script:
 *   - If inferenceResult is an object with a numeric `decision` field,
 *     we use that directly.
 *   - Else, if it has a `classification` array (e.g. 3-way softmax), we
 *     take argmax over that.
 *   - Else, if it is itself an array, we also take argmax.
 */
function getPredictedDecision (inferenceResult) {
    if (inferenceResult == null) return null

    // Case 0: Model.inference() already ran the decision rule
    // and exposed the discrete class index.
    if (typeof inferenceResult.predictedClass === 'number') {
        return inferenceResult.predictedClass
    }

    // Case 1: inference transform returned { decision: 0|1|2, ... }
    if (typeof inferenceResult === 'object' && typeof inferenceResult.decision === 'number') {
        return inferenceResult.decision
    }

    // Case 2: nested classification head on the prediction object
    if (inferenceResult.prediction && Array.isArray(inferenceResult.prediction.classification)) {
        return getPredictedDecisionFromArray(inferenceResult.prediction.classification)
    }

    // Case 3: { classification: [pBuy,pSell,pHold], ... }
    if (typeof inferenceResult === 'object' && Array.isArray(inferenceResult.classification)) {
        return getPredictedDecisionFromArray(inferenceResult.classification)
    }

    // Case 4: plain array [pBuy,pSell,pHold]
    if (Array.isArray(inferenceResult)) {
        return getPredictedDecisionFromArray(inferenceResult)
    }

    return null
}

const work = async () => {
    // ------------------------------------------------------------------
    // 1. Prepare data & model
    // ------------------------------------------------------------------
    const config = loadConfig(process.argv[2] || 'simple')
    const samples = await cache.samples(config)
    const model = await createModel({ ...config, samplesMetadata: samples.metadata })

    console.log(model.summary.initModel)

    // ------------------------------------------------------------------
    // 2. Prepare CSV logging
    // ------------------------------------------------------------------
    const csvPath = paths.modelPredLog(config)
    const fs = require('fs')
    if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath)
    }
    const csv = new Csv(csvPath, false)

    // ------------------------------------------------------------------
    // 3. Main inference loop
    // ------------------------------------------------------------------
    const predictionCount = Math.min(config.train.samplesCount || samples.length, samples.length)
    const bar = progressBar(`Running inference on ${predictionCount} samples...`, !csv.consoleOutput)
    bar.start(predictionCount, 0)

    // Confusion matrix: rows = GT, cols = predicted
    const confusion = [
        [0, 0, 0], // GT BUY   → [PRED_BUY, PRED_SELL, PRED_HOLD]
        [0, 0, 0], // GT SELL
        [0, 0, 0] // GT HOLD
    ]

    let total = 0
    let correct = 0

    for (let i = 0; i < predictionCount; i++) {
        const sample = samples.read(i)

        const inferenceResult = await model.inference(sample)

        const groundTruthDecision = getGroundTruthDecision(inferenceResult, sample)
        if (groundTruthDecision === null || groundTruthDecision < 0 || groundTruthDecision > 2) {
            bar.update(i + 1)
            continue
        }

        const predictedDecision = getPredictedDecision(inferenceResult)

        if (predictedDecision === null || predictedDecision < 0 || predictedDecision > 2) {
            bar.update(i + 1)
            continue
        }

        total++
        confusion[groundTruthDecision][predictedDecision]++
        if (groundTruthDecision === predictedDecision) {
            correct++
        }

        csv.print({
            sampleIndex: i,
            groundTruthDecision,
            predictedDecision,
            groundTruthLabel: decisionNames[groundTruthDecision],
            predictedLabel: decisionNames[predictedDecision]
        })

        bar.update(i + 1)
    }

    bar.stop()

    // ------------------------------------------------------------------
    // 4. Summary
    // ------------------------------------------------------------------
    console.log('\n=== Decision Accuracy ===')
    console.log(`Total evaluated samples: ${total.toLocaleString()}`)
    if (total > 0) {
        console.log(`Correct predictions   : ${correct.toLocaleString()}`)
        console.log(`Accuracy              : ${(correct / total * 100).toFixed(2)}%`)
    } else {
        console.log('No samples with valid ground-truth decision.')
    }

    console.log('\nConfusion matrix (rows = ground truth, cols = predicted)')
    console.log('          PRED_BUY  PRED_SELL  PRED_HOLD')
    const rowLabels = ['GT_BUY  ', 'GT_SELL ', 'GT_HOLD ']
    for (let r = 0; r < 3; r++) {
        const row = confusion[r].map(x => x.toString().padStart(9)).join(' ')
        console.log(rowLabels[r] + row)
    }

    console.log(`\nPredictions saved to ${csvPath}`)
}

work().catch(err => {
    console.error('FATAL in pred.js:', err)
    process.exit(1)
})
