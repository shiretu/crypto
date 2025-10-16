module.exports = {
    tableName: (exchangeName, symbolName) => {
        return `market.trades_${exchangeName}_${symbolName}`
    }
}
