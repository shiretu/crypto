import fs from 'fs'
import path from 'path'

const getFilePath = (dataDir, type, symbol, { year, month, day }, ...extra) => {
    return path.join(dataDir, type, symbol.exchange.id,
        `${symbol.base.id}${symbol.quote.id}`, ...extra.map(String),
        String(year), String(month).padStart(2, '0'), `${String(day).padStart(2, '0')}.bin`)
}

const saveFile = async (filePath, data) => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    const tmpFile = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    try {
        await fs.promises.writeFile(tmpFile, data)
        try {
            await fs.promises.link(tmpFile, filePath)
        } catch (err) {
            if (err.code !== 'EEXIST') throw err
        }
    } finally {
        await fs.promises.unlink(tmpFile).catch(() => {})
    }
}

export { getFilePath, saveFile }
