/**
 * Simple Test Client
 * Connects, sends 3 samples, checks stats, saves model, and exits
 */

const WebSocket = require('ws')

const getWs = async () => {
    const ws = new WebSocket('ws://localhost:8080')
    return new Promise((resolve, reject) => {
        ws.on('open', () => resolve(ws))
        ws.once('error', reject)
    })
}

const doRequest = (ws, request) => {
    return new Promise((resolve, reject) => {
        ws.once('message', (data) => {
            const message = JSON.parse(data.toString())
            resolve(message)
        })
        ws.once('error', reject)
        ws.send(JSON.stringify(request))
    })
}

let sampleNum = 0
const createTrainRequest = (samplesCount) => {
    const result = {
        type: 'train',
        samples: []
    }
    for (let i = 0; i < samplesCount; i++) {
        sampleNum++
        // Create hardcoded sample data with slight variations (normalized)
        const basePrice = 50 + (sampleNum * 0.1) // Scale down from 50000 to 50
        const variation = sampleNum * 0.001 // Much smaller variation

        result.samples.push({
            features: {
                candles: {
                    opens: new Array(120).fill(basePrice),
                    highs: new Array(120).fill(basePrice + 5), // Scale down from 500 to 5
                    lows: new Array(120).fill(basePrice - 5), // Scale down from 500 to 5
                    closes: new Array(120).fill(basePrice + (sampleNum * 0.05)), // Scale down
                    volumes: new Array(120).fill(1 + sampleNum * 0.01), // Scale down volumes
                    timestamps: new Array(120).fill(sampleNum), // Use relative timestamps instead of actual unix time
                    colors: new Array(120).fill(sampleNum % 2 === 0 ? 1 : -1),
                    bodySizes: new Array(120).fill(2 + sampleNum * 0.1) // Scale down body sizes
                },
                studies: {
                    sma9: new Array(120).fill(basePrice + 1),
                    sma12: new Array(120).fill(basePrice + 0.5),
                    sma21: new Array(120).fill(basePrice),
                    ema9: new Array(120).fill(basePrice + 1.5),
                    ema12: new Array(120).fill(basePrice + 1),
                    ema21: new Array(120).fill(basePrice + 0.5),
                    rsi14: new Array(120).fill(50 + sampleNum * 0.5) // Keep RSI in 0-100 range
                },
                patterns: {
                    single: new Array(119).fill(0),
                    sliding: new Array(118).fill(0)
                },
                global: {
                    candleDuration: 1,
                    windowSize: 120,
                    grossProfitTarget: 0.7,
                    grossStopLoss: 0.4,
                    positionSize: 100,
                    fees: 0.2
                }
            },
            outcomes: {
                grossBuy: variation + (sampleNum === 1 ? 0.8 : sampleNum === 2 ? -0.3 : 0.0),
                grossSell: variation + (sampleNum === 1 ? -0.2 : sampleNum === 2 ? 0.6 : 0.0)
            }
        })
    }
    return result
}

const work = async () => {
    const ws = await getWs()
    console.log(await doRequest(ws, createTrainRequest(1)))
    console.log(await doRequest(ws, createTrainRequest(10)))
    console.log(await doRequest(ws, createTrainRequest(100)))
    console.log(await doRequest(ws, createTrainRequest(1000)))
    for (let i = 0; i < 100; i++) {
        console.log(await doRequest(ws, createTrainRequest(5000)))
    }
    console.log(JSON.stringify(await doRequest(ws, { type: 'stats' })))
    console.log(await doRequest(ws, { type: 'save' }))
    ws.close()
}

work()
