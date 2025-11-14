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

const _model = ({ data: { folder }, model: { name } }) => path.resolve(folder, 'models', name, 'arch.json')

module.exports = {
    trades: _trades,
    candles: _candles,
    samples: _samples,
    model: _model,
    config: (name) => path.resolve(__dirname, '..', '..', '..', 'configs', `${name}.json`)
}
