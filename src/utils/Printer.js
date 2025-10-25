/* eslint-disable no-unused-vars */
const { createCanvas } = require('canvas')
const fs = require('fs/promises')
const path = require('path')
const Candle = require('../core/Candle')
/* eslint-enable no-unused-vars */

class Box {
    x
    y
    w
    h
    fc
    bc

    get x1 () { return this.x }
    get y1 () { return this.y }
    get x2 () { return this.x + this.w }
    get y2 () { return this.y + this.h }

    boundingBox (otherBox) {
        if (!otherBox) { return Box.create(this.x1, this.y1, this.x2, this.y2) }
        return Box.create(
            Math.min(this.x1, otherBox.x1),
            Math.min(this.y1, otherBox.y1),
            Math.max(this.x2, otherBox.x2),
            Math.max(this.y2, otherBox.y2)
        )
    }

    transformX (fnc) {
        const x2 = fnc(this.x2)
        this.x = fnc(this.x)
        this.w = x2 - this.x
    }

    transformY (fnc) {
        const y2 = fnc(this.y2)
        this.y = fnc(this.y)
        this.h = y2 - this.y
    }

    draw (ctx) {
        const y = ctx.canvas.height - this.y - this.h
        ctx.fillStyle = this.fc
        ctx.fillRect(this.x, y, this.w, this.h)
        if (this.bc) {
            ctx.strokeStyle = this.bc
            ctx.lineWidth = 1
            ctx.strokeRect(this.x, y, this.w, this.h)
        }
    }

    static create (x1, y1, x2, y2, fc, bc) {
        const result = new Box()
        result.fc = fc
        result.bc = bc
        if (x1 < x2) {
            result.x = x1
            result.w = x2 - x1
        } else {
            result.x = x2
            result.w = x1 - x2
        }
        if (y1 < y2) {
            result.y = y1
            result.h = y2 - y1
        } else {
            result.y = y2
            result.h = y1 - y2
        }
        return result
    }
}

class Line {
    x1
    y1
    x2
    y2
    c

    boundingBox (otherBox) {
        if (!otherBox) { return Box.create(this.x1, this.y1, this.x2, this.y2) }
        return otherBox.boundingBox(Box.create(this.x1, this.y1, this.x2, this.y2))
    }

    transformX (fnc) {
        this.x1 = fnc(this.x1)
        this.x2 = fnc(this.x2)
    }

    transformY (fnc) {
        this.y1 = fnc(this.y1)
        this.y2 = fnc(this.y2)
    }

    draw (ctx) {
        ctx.beginPath()
        ctx.strokeStyle = this.c
        ctx.lineWidth = 1
        ctx.moveTo(this.x1, ctx.canvas.height - this.y1)
        ctx.lineTo(this.x2, ctx.canvas.height - this.y2)
        ctx.stroke()
    }

    static create (x1, y1, x2, y2, c) {
        const result = new Line()
        result.x1 = x1
        result.x2 = x2
        result.y1 = y1
        result.y2 = y2
        result.c = c
        return result
    }
}

class Printer {
    #candles = []
    #volumes = []
    /**
     * @param {Candle} candle
     */
    addCandle (candle) {
        this.#candles.push(Box.create(
            candle.tsUs.open,
            candle.prices.open,
            candle.tsUs.close,
            candle.prices.close,
            candle.direction > 0 ? '#2ecc71' : '#e74c3c',
            '#000000'
        ))
        const topEdgePrice = Math.max(candle.prices.open, candle.prices.close)
        if (topEdgePrice < candle.prices.high) {
            this.#candles.push(Line.create(candle.tsUs.high, topEdgePrice, candle.tsUs.high, candle.prices.high, '#000000'))
        }
        const bottomEdgePrice = Math.min(candle.prices.open, candle.prices.close)
        if (bottomEdgePrice > candle.prices.low) {
            this.#candles.push(Line.create(candle.tsUs.low, candle.prices.low, candle.tsUs.low, bottomEdgePrice, '#000000'))
        }
        this.#volumes.push(Box.create(
            candle.tsUs.open,
            0,
            candle.tsUs.close,
            candle.volumes.quote,
            candle.direction > 0 ? '#2ecc71' : '#e74c3c'
        ))
    }

    addCandles (candles) {
        candles.forEach(c => this.addCandle(c))
    }

    async print (fullPath, title = '', height = 400, candleDurationUs = 60000000, candleWidth = 32) {
        const normalize = (shapes, height) => {
            const boundingBox = shapes.reduce((result, shape) => { return shape.boundingBox(result) }, shapes[0].boundingBox(null))
            const translateToOriginX = (v) => v - boundingBox.x
            const translateToOriginY = (v) => v - boundingBox.y
            const scaleX = v => v * candleWidth / candleDurationUs
            const scaleY = v => v * height / boundingBox.h
            shapes.forEach(s => s.transformX(v => scaleX(translateToOriginX(v))))
            shapes.forEach(s => s.transformY(v => scaleY(translateToOriginY(v))))
            return shapes.reduce((result, shape) => { return shape.boundingBox(result) }, shapes[0].boundingBox(null))
        }
        normalize(this.#candles, height)
        const gap = 10
        const volumesBox = normalize(this.#volumes, Math.floor(height / 3))
        this.#candles.forEach(s => s.transformY(v => v + volumesBox.h + gap))
        const canvas = Printer.#draw([
            ...this.#candles,
            Line.create(0, volumesBox.h + 5, volumesBox.w, volumesBox.h + gap / 2, '#000000'),
            ...this.#volumes
        ])
        const folderPath = path.dirname(fullPath)
        await fs.mkdir(folderPath, { recursive: true })
        await fs.writeFile(fullPath, canvas.toBuffer('image/png'))
    }

    static #draw (shapes) {
        const screenBox = shapes.reduce((result, shape) => { return shape.boundingBox(result) }, shapes[0].boundingBox(null))
        const canvas = createCanvas(screenBox.w, screenBox.h)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, screenBox.w, screenBox.h)
        shapes.forEach(s => s.draw(ctx))
        return canvas
    }
}

module.exports = Printer
