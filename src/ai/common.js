const path = require('path')
const Symbol = require('../core/Symbol')
const BinanceRawReader = require('../sources/BinanceRawReader')
const CandlesMap = require('../sources/CandlesMap')

const _loadConfig = async (modelName) => {
    const result = { modelName }
    result.rootFolder = path.resolve(__dirname, '../../')
    result.modelsFolder = path.resolve(result.rootFolder, 'models')
    result.modelFolder = path.join(result.modelsFolder, modelName)
    result.modelConfigPath = path.join(result.modelFolder, 'config.json')
    result.modelArchPath = path.join(result.modelFolder, 'arch.json')
    result.dataFolder = path.resolve(result.rootFolder, 'data')
    Object.entries(require(result.modelConfigPath)).forEach(([k, v]) => { result[k] = v })
    result.symbol = Symbol.find(result.symbol)
    result.tradesDataPath = path.join(result.dataFolder, `${result.exchangeName}_${result.symbol.id}_trades.bin`)
    result.tradesReader = BinanceRawReader.create(result.tradesDataPath, result.symbol)
    result.candlesMap = await CandlesMap.create(result)
    result.modelArch = require(result.modelArchPath)
    return result
}

module.exports = {
    loadConfig: _loadConfig,
    loadNn: async (config) => {
        return await require(`./${config.nnType}`).load(config)
    }
}
