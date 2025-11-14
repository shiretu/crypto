const path = require('path')

const _instrument = ({
    folder,
    exchange: {
        name
    },
    symbol: {
        baseAssetName,
        quoteAssetName
    }
}) => path.resolve(folder, 'data', name, baseAssetName, quoteAssetName)

const _trades = ({ data }) => path.resolve(_instrument(data), 'trades.bin')

const _candlesBase = ({
    data,
    candle: {
        periodSec
    }
}) => path.resolve(_instrument(data), `${periodSec}`)

const _candles = (config) => path.resolve(_candlesBase(config), 'candles.bin')

const _samples = ({
    data,
    candle,
    train: {
        candlesWindowCount
    },
    trade: {
        maxDurationSec,
        tpPercent,
        slPercent
    }
}) => path.resolve(_candlesBase({ data, candle }), `${candlesWindowCount}`, `${maxDurationSec}`, `${tpPercent}`, `${slPercent}`, 'samples.bin')

const _modelBase = ({ data: { folder }, model: { name } }) => path.resolve(folder, 'models', name)
const _modelArch = (config) => path.resolve(_modelBase(config), 'arch.json')
const _modelRunnerFolder = ({ data: { folder }, model: { name, runner } }) => path.resolve(_modelBase({ data: { folder }, model: { name, runner } }), runner)

module.exports = {
    config: (name) => path.resolve(__dirname, '..', '..', '..', 'configs', `${name}.json`),
    trades: _trades,
    candles: _candles,
    samples: _samples,
    modelArch: _modelArch,
    modelRunnerFolder: _modelRunnerFolder
}
