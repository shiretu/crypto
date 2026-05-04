import fs from 'fs'
import path from 'path'
import { dateStr } from './date.js'

const getFilePath = (dataDir, type, symbol, year, month, day, ...extra) => {
    return path.join(dataDir, type, symbol.exchange.id,
        `${symbol.base.id}${symbol.quote.id}`, ...extra.map(String), `${dateStr(year, month, day)}.bin`)
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
