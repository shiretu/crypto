const { createCanvas } = require('canvas')
const fs = require('fs/promises')
const path = require('path')

const _drawRect = (ctx, rect) => {
    ctx.fillStyle = rect.f
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    if (rect.e) {
        ctx.strokeStyle = rect.e
        ctx.lineWidth = 1
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
    }
}

const _drawLine = (ctx, line) => {
    ctx.beginPath()
    ctx.strokeStyle = line.c
    ctx.lineWidth = 1
    ctx.moveTo(line.x1, line.y1)
    ctx.lineTo(line.x2, line.y2)
    ctx.stroke()
}

const _boundingBox = (shapes) => {
    return shapes.reduce((result, shape) => {
        switch (shape.t) {
            case 'r':{
                result.w = Math.max(result.w, shape.x + shape.w)
                result.h = Math.max(result.h, shape.y + shape.h)
                break
            }
            case 'l':{
                result.w = Math.max(result.w, shape.x1, shape.x2)
                result.h = Math.max(result.h, shape.y1, shape.y2)
                break
            }
            default: throw new Error('Invalid shape')
        }
        return result
    }, { w: 0, h: 0 })
}

const _normalizeToCanvas = (totalHeight, unitW, unitH, shapes) => {
    shapes.forEach(shape => {
        switch (shape.t) {
            case 'r':{
                shape.x *= unitW
                shape.y *= unitH
                shape.w *= unitW
                shape.h *= unitH
                shape.y = totalHeight - shape.y - shape.h
                break
            }
            case 'l':{
                shape.x1 *= unitW
                shape.x2 *= unitW
                shape.y1 = totalHeight - shape.y1 * unitH
                shape.y2 = totalHeight - shape.y2 * unitH
                break
            }
            default: throw new Error('Invalid shape')
        }
    })
    return shapes
}

const _translateY = (delta, shapes) => {
    shapes.forEach(shape => {
        switch (shape.t) {
            case 'r':{
                shape.y += delta
                break
            }
            case 'l':{
                shape.y1 += delta
                shape.y2 += delta
                break
            }
            default: throw new Error('Invalid shape')
        }
    })
    return shapes
}

const _flowVertical = (top, bottom) => {
    const topBoundingBox = _boundingBox(top)
    _translateY(topBoundingBox.h + 20, bottom)
    return [...top, ...bottom]
}

const _draw = (shapes) => {
    const box = _boundingBox(shapes)
    const canvas = createCanvas(box.w, box.h)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, box.w, box.h)
    shapes.forEach(shape => {
        switch (shape.t) {
            case 'r':{
                _drawRect(ctx, shape)
                break
            }
            case 'l':{
                _drawLine(ctx, shape)
                break
            }
            default: throw new Error('Invalid shape')
        }
    })
    return canvas
}

const _generateCandles = (candles, lowestLow) => {
    const shapes = candles.reduce((result, candle, index) => {
        const bottomEdge = Math.min(candle.info.open, candle.info.close)
        const topEdge = Math.max(candle.info.open, candle.info.close)
        const rectangle = {
            t: 'r',
            x: index,
            y: bottomEdge - lowestLow,
            w: 1,
            h: Math.abs(candle.info.open - candle.info.close),
            f: candle.direction > 0 ? '#2ecc71' : '#e74c3c',
            e: '#000000'
        }
        result.push(rectangle)

        const bottomWickLength = bottomEdge - candle.info.low
        if (bottomWickLength > 0) {
            result.push({
                t: 'l',
                x1: rectangle.x + 0.5,
                y1: rectangle.y,
                x2: rectangle.x + 0.5,
                y2: rectangle.y - bottomWickLength,
                c: '#000000'
            })
        }

        const topWickLength = candle.info.high - topEdge
        if (topWickLength > 0) {
            result.push({
                t: 'l',
                x1: rectangle.x + 0.5,
                y1: rectangle.y + rectangle.h,
                x2: rectangle.x + 0.5,
                y2: rectangle.y + rectangle.h + topWickLength,
                c: '#000000'
            })
        }
        return result
    }, [])
    shapes.push({
        t: 'l',
        x1: 0,
        y1: 0,
        x2: candles.length,
        y2: 0,
        c: '#000000'
    })
    return shapes
}

const _generateVolumes = (candles) => {
    return candles.reduce((result, candle, index) => {
        result.push({
            t: 'r',
            x: index,
            y: 0,
            w: 1,
            h: candle.info.baseVolume,
            f: candle.direction > 0 ? '#2ecc71' : '#e74c3c'
        })
        return result
    }, [])
}

const _generatePng = (candles) => {
    const lowestLow = Math.min(...candles.map(c => c.info.low))
    const highestHigh = Math.max(...candles.map(c => c.info.high))
    const maxVolume = Math.max(...candles.map(c => c.info.baseVolume))

    const totalWidth = Math.min(candles.length * 16, 2000)
    const unitW = totalWidth / candles.length
    const candlesHeight = 300
    const volumesHeight = 150

    return _draw(
        _flowVertical(
            _normalizeToCanvas(candlesHeight, unitW, candlesHeight / (highestHigh - lowestLow), _generateCandles(candles, lowestLow)),
            _normalizeToCanvas(volumesHeight, unitW, volumesHeight / maxVolume, _generateVolumes(candles))
        )
    )
}

const _savePng = async (fullPath, canvas) => {
    const folderPath = path.dirname(fullPath)
    await fs.mkdir(folderPath, { recursive: true })
    await fs.writeFile(fullPath, canvas.toBuffer('image/png'))
}

module.exports = {
    generatePng: _generatePng,
    savePng: _savePng,
    generateAndSavePng: async (fullPath, candles) => await _savePng(fullPath, _generatePng(candles))
}
