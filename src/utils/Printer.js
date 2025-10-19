const { createCanvas } = require('canvas')
const fs = require('fs/promises')
const path = require('path')

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
        if (!otherBox) { return Box.createFromCorners(this.x1, this.y1, this.x2, this.y2) }
        return Box.createFromCorners(
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

    static createFromCorners (x1, y1, x2, y2, fc, bc) {
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
        if (!otherBox) { return Box.createFromCorners(this.x1, this.y1, this.x2, this.y2) }
        return otherBox.boundingBox(Box.createFromCorners(this.x1, this.y1, this.x2, this.y2))
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
    addCandleInfo (info) {
        this.#candles.push(Box.createFromCorners(
            info.ts_.open,
            info.price.open,
            info.ts_.close,
            info.price.close,
            info.direction > 0 ? '#2ecc71' : '#e74c3c',
            '#000000'
        ))
        const topEdgePrice = Math.max(info.price.open, info.price.close)
        if (topEdgePrice < info.price.high) {
            this.#candles.push(Line.create(info.ts_.high, topEdgePrice, info.ts_.high, info.price.high, '#000000'))
        }
        const bottomEdgePrice = Math.min(info.price.open, info.price.close)
        if (bottomEdgePrice > info.price.low) {
            this.#candles.push(Line.create(info.ts_.low, info.price.low, info.ts_.low, bottomEdgePrice, '#000000'))
        }
        this.#volumes.push(Box.createFromCorners(
            info.ts_.open,
            0,
            info.ts_.close,
            info.baseVolume,
            info.direction > 0 ? '#2ecc71' : '#e74c3c'
        ))
    }

    addCandle (candle) { this.addCandleInfo(candle.info) }
    addCandles (candles) {
        candles.forEach(c => this.addCandle(c))
    }

    async print (fullPath, height = 400, candleDurationUs = 60000000, candleWidth = 16) {
        const boundingBox = this.#boundingBox()
        const translateToOriginX = (v) => v - boundingBox.x
        const translateToOriginY = (v) => v - boundingBox.y
        const scaleX = v => v * candleWidth / candleDurationUs
        const scaleY = v => v * height / boundingBox.h
        this.#transformX(v => scaleX(translateToOriginX(v)))
        this.#transformY(v => scaleY(translateToOriginY(v)))
        const screenBox = this.#boundingBox()
        const canvas = createCanvas(screenBox.w, screenBox.h)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, screenBox.w, screenBox.h)
        this.#candles.forEach(s => s.draw(ctx))
        const folderPath = path.dirname(fullPath)
        await fs.mkdir(folderPath, { recursive: true })
        await fs.writeFile(fullPath, canvas.toBuffer('image/png'))
    }

    #boundingBox () {
        return this.#candles.reduce((result, shape) => {
            return shape.boundingBox(result)
        }, this.#candles[0].boundingBox(null))
    }

    #transformX (fnc) {
        this.#candles.forEach(s => s.transformX(fnc))
    }

    #transformY (fnc) {
        this.#candles.forEach(s => s.transformY(fnc))
    }
}

module.exports = {
    Printer,
    Box
}
