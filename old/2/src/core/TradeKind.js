const { Enum } = require('enum-plus')

module.exports = Enum({
    hold: { value: 0, description: 'Hold' },
    buy: { value: 1, description: 'Buy' },
    sell: { value: 2, description: 'Sell' }
})
