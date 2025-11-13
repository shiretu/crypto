const fs = require('fs').promises
const { progressBar } = require('./progressBar')

const _readFullFile = async (filePath) => {
    const stats = await fs.stat(filePath)
    const fd = await fs.open(filePath, 'r')
    try {
        const result = Buffer.allocUnsafe(stats.size)
        const chunkSize = 1024 * 1024 * 1024 // 1GB chunks
        let offset = 0
        const bar = progressBar(`Loading ${filePath} ...`)
        bar.start(stats.size, 0)
        while (offset < stats.size) {
            const bytesToRead = Math.min(chunkSize, stats.size - offset)
            await fd.read(result, offset, bytesToRead, offset)
            offset += bytesToRead
            bar.update(offset)
        }
        bar.stop()
        return result
    } catch (err) {
        console.log(err)
        throw err
    } finally {
        await fd.close()
    }
}

module.exports = {
    readFullFile: _readFullFile
}
