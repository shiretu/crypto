/* eslint-env mocha */
const assert = require('assert')
const Symbol = require('../src/core/Symbol')
const Trade = require('../src/core/Trade')

describe('Trade', () => {
    const symbol = new Symbol('BTC', 'USDC')
    it('should construct with all properties', () => {
        const t = new Trade('binance', symbol, 'lid', 'rid', 'olid', 1234567890, 42000.5, 0.1, 4200.05, true)
        assert.strictEqual(t.exchangeName, 'binance')
        assert.strictEqual(t.symbol, symbol)
        assert.strictEqual(t.localId, 'lid')
        assert.strictEqual(t.remoteId, 'rid')
        assert.strictEqual(t.orderLocalId, 'olid')
        assert.strictEqual(t.tsUs, 1234567890)
        assert.strictEqual(typeof t.tsHr, 'string')
        assert.strictEqual(t.price, 42000.5)
        assert.strictEqual(t.baseQty, 0.1)
        assert.strictEqual(t.quoteQty, 4200.05)
        assert.strictEqual(t.isBuyerMaker, true)
    })

    it('should convert tsUs to ISO string in tsHr', () => {
        const t = new Trade('binance', symbol, 'lid', 'rid', 'olid', 1000000, 1, 1, 1, false)
        assert.match(t.tsHr, /^\d{4}-\d{2}-\d{2}T/)
    })
})
