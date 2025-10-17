const { createCanvas } = require('canvas')
const fs = require('fs/promises')
const path = require('path')

const dayDurationMs = 24 * 3600 * 1000

const dayStart = (tsMs) => {
    return Math.floor(tsMs / dayDurationMs) * dayDurationMs
}

module.exports = {
    computeBuyProfit: (buyPrice, sellPrice, buyQuoteQty, buyFeePer = 0.001, sellFeePer = 0.001) => {
        const buyBaseQty = buyQuoteQty / buyPrice
        const buyFeeQty = buyQuoteQty * buyFeePer
        const sellQuoteQty = buyBaseQty * sellPrice
        const sellFeeQty = sellQuoteQty * sellFeePer
        return sellQuoteQty - buyQuoteQty - buyFeeQty - sellFeeQty
    },
    computeSellProfit: (sellPrice, buyPrice, sellBaseQty, sellFeePer = 0.001, buyFeePer = 0.001) => {
        const sellQuoteQty = sellBaseQty * sellPrice
        const sellFeeQty = sellQuoteQty * sellFeePer
        const buyBaseQty = sellQuoteQty / buyPrice
        const buyFeeQty = sellQuoteQty * buyFeePer
        return (buyBaseQty - sellBaseQty) * buyPrice - sellFeeQty - buyFeeQty
    },
    safeExec: async (fnc) => {
        try {
            await fnc()
        } catch (e) {
            console.error(e)
        }
    },
    dayStart,
    dayDurationMs,
    generatePng: async (fullPath, candles) => {
        const lowestLow = Math.min(...candles.map(candle => candle.info.low))
        const highestHigh = Math.max(...candles.map(candle => candle.info.high))
        const logicalHeight = highestHigh - lowestLow
        const logicalWidth = candles.length

        const totalHeight = 400
        const totalWidth = Math.min(logicalWidth * 16, 2000)

        const candleWidth = totalWidth / candles.length
        const candleHeight = totalHeight / logicalHeight

        const canvas = createCanvas(totalWidth, totalHeight)
        const ctx = canvas.getContext('2d')

        // bkg
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, totalWidth, totalHeight)

        // get the list of squares and their color. We will also transform the coordinates
        candles.forEach((candle, index) => {
            const topMargin = Math.max(candle.open.price, candle.close.price)
            const bottomMargin = Math.min(candle.open.price, candle.close.price)
            const x = candleWidth * index
            const y = candleHeight * (highestHigh - topMargin)
            const w = candleWidth
            const h = candleHeight * (topMargin - bottomMargin)
            const c = candle.direction > 0 ? '#2ecc71' : '#e74c3c'

            ctx.fillStyle = c
            ctx.fillRect(x, y, w, h)
            ctx.strokeStyle = '#000000'
            ctx.lineWidth = 1
            ctx.strokeRect(x, y, w, h)

            ctx.beginPath()
            ctx.strokeStyle = '#000000'
            ctx.lineWidth = 1
            ctx.moveTo(x + candleWidth / 2, candleHeight * (highestHigh - candle.info.high))
            ctx.lineTo(x + candleWidth / 2, y)
            ctx.moveTo(x + candleWidth / 2, y + h)
            ctx.lineTo(x + candleWidth / 2, candleHeight * (highestHigh - candle.info.low))
            ctx.stroke()
        })

        // write file
        const folderPath = path.dirname(fullPath)
        await fs.mkdir(folderPath, { recursive: true })
        await fs.writeFile(fullPath, canvas.toBuffer('image/png'))
    }
}
