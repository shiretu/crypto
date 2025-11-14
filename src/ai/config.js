const Symbol = require('../core/Symbol')
const paths = require('./common/paths')
const fs = require('fs')

const _loadConfig = (filePathOrConfName) => {
    // Determine the config file path (.json extension = direct path, otherwise = config name)
    const configPath = filePathOrConfName.endsWith('.json')
        ? filePathOrConfName
        : paths.config(filePathOrConfName)

    // Read and parse the config file (no caching)
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    // Transform properties
    raw.data.symbol = Symbol.find(raw.data.symbol)
    raw.trade.tpPercent /= 100.0
    raw.trade.slPercent /= 100.0
    raw.train.startTimestamp = new Date(raw.train.startTimestamp)
    raw.train.endTimestamp = new Date(raw.train.endTimestamp)
    raw.train.samplesCount = raw.train.samplesCount || null

    return raw
}

module.exports = {
    loadConfig: _loadConfig
}
