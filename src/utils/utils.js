const { createCanvas } = require('canvas')
const fs = require('fs/promises')
const path = require('path')

module.exports = {
    safeExec: async (fnc) => {
        try {
            await fnc()
        } catch (e) {
            console.error(e)
        }
    },
    generatePng: async (order, fullPath) => {
        const inc1 = order?.metadata?.firstIncrease ?? []
        const dec = order?.metadata?.decrease ?? []
        const inc2 = order?.metadata?.secondIncrease ?? []
        const allCandles = [...inc1, ...dec, ...inc2]

        // Tiny placeholder if no data
        if (allCandles.length === 0) {
            const c = createCanvas(2, 2)
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, 2, 2)
            await fs.mkdir(path.dirname(fullPath), { recursive: true })
            await fs.writeFile(fullPath, c.toBuffer('image/png'))
            return fullPath
        }

        // ---- Price bounds
        const highs = allCandles.map(c => Number(c.info.high)).sort((a, b) => a - b)
        const lows = allCandles.map(c => Number(c.info.low)).sort((a, b) => a - b)
        const maxHigh = highs[highs.length - 1]
        const minLow = lows[0]
        const priceRange = Math.max(1e-12, maxHigh - minLow)

        const logicalWidth = allCandles.length

        // ---- Layout
        const chartHeight = 500 // drawing area (excluding top header)
        const yLabelWidth = 80 // right margin for price labels
        const gridCount = 6

        // width from aspect
        let chartWidth = Math.ceil((chartHeight * logicalWidth) / Math.ceil(priceRange))
        let pixelWidth = Math.ceil(chartWidth / logicalWidth)
        if (pixelWidth % 2 !== 0) pixelWidth++
        chartWidth = Math.max(1, pixelWidth * logicalWidth)

        const pxPerPrice = chartHeight / priceRange

        // ---- Header texts
        const titleText = order?.metadata?.startTsHr ?? ''
        const profitNum = Number(order?.profitQty ?? 0)
        const profitText = profitNum.toFixed(8) // exactly 8 decimals

        const tmp = createCanvas(10, 10)
        const tctx = tmp.getContext('2d')

        const titleFont = '16px sans-serif'
        const profitFont = '14px monospace'

        // measure title
        tctx.font = titleFont
        const mTitle = tctx.measureText(titleText)
        const titleH = (mTitle.actualBoundingBoxAscent ?? 12) + (mTitle.actualBoundingBoxDescent ?? 4)

        // measure profit
        tctx.font = profitFont
        const mProfit = tctx.measureText(profitText)
        const profitH = (mProfit.actualBoundingBoxAscent ?? 11) + (mProfit.actualBoundingBoxDescent ?? 4)

        const titlePad = 8 // top & bottom padding around the two-line header
        const gap = 4 // gap between title and profit line
        const topMargin = Math.ceil(titlePad + titleH + gap + profitH + titlePad)

        const fullWidth = chartWidth + yLabelWidth
        const fullHeight = chartHeight + topMargin

        // ---- Canvas
        const canvas = createCanvas(fullWidth, fullHeight)
        const ctx = canvas.getContext('2d')

        // background
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, fullWidth, fullHeight)

        // ---- Header: title (first line)
        ctx.fillStyle = '#000000'
        ctx.font = titleFont
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const titleY = titlePad
        ctx.fillText(titleText, fullWidth / 2, titleY)

        // ---- Header: profit (second line under title)
        const profitY = titlePad + titleH + gap
        const profitColor = profitNum > 0 ? '#2ecc71' : profitNum < 0 ? '#e74c3c' : '#333333'
        ctx.font = profitFont
        ctx.fillStyle = profitColor
        ctx.fillText(profitText, fullWidth / 2, profitY)

        // optional separator line under header
        ctx.strokeStyle = '#e5e5e5'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, topMargin - 0.5)
        ctx.lineTo(chartWidth, topMargin - 0.5)
        ctx.stroke()

        // ---- CHART (bottom-left origin inside chart area)
        ctx.save()
        ctx.translate(0, topMargin + chartHeight)
        ctx.scale(1, -1)

        const yOf = (p) => (p - minLow) * pxPerPrice

        // Candles
        for (let i = 0; i < allCandles.length; i++) {
            const info = allCandles[i].info
            const leftX = i * pixelWidth
            const width = pixelWidth
            const cx = leftX + width / 2

            const yOpen = yOf(info.open)
            const yClose = yOf(info.close)
            const yHigh = yOf(info.high)
            const yLow = yOf(info.low)

            const bodyBottom = Math.min(yOpen, yClose)
            const bodyTop = Math.max(yOpen, yClose)
            const bodyH = Math.max(1, bodyTop - bodyBottom)

            // wick
            ctx.strokeStyle = '#000'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(cx, yHigh)
            ctx.lineTo(cx, yLow)
            ctx.stroke()

            // body
            ctx.fillStyle = info.direction > 0 ? '#2ecc71' : (info.direction < 0 ? '#e74c3c' : '#95a5a6')
            ctx.fillRect(leftX, bodyBottom, width, bodyH)
            ctx.strokeStyle = '#000'
            ctx.strokeRect(leftX, bodyBottom, width, bodyH)
        }
        ctx.restore() // back to normal top-left coords

        // ---- Grid + price labels (normal coords)
        ctx.font = '12px monospace'
        ctx.fillStyle = '#000'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.strokeStyle = '#cccccc'
        ctx.lineWidth = 0.5

        const step = priceRange / (gridCount - 1)
        for (let i = 0; i < gridCount; i++) {
            const price = minLow + step * i
            const yChart = chartHeight - yOf(price)
            const y = topMargin + yChart

            ctx.beginPath()
            ctx.moveTo(0, y + 0.5)
            ctx.lineTo(chartWidth, y + 0.5)
            ctx.stroke()

            ctx.fillText(price.toFixed(2), chartWidth + 5, y)
        }

        // write file
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, canvas.toBuffer('image/png'))
        return fullPath
    }

}
