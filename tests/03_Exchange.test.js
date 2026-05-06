import { expect } from 'chai'
import Exchange from '../src/core/Exchange.js'

describe('Exchange', () => {
    it('should store id lowercase', () => {
        const ex = new Exchange('Binance')
        expect(ex.id).to.equal('binance')
    })

    it('should return id lowercase for any case input', () => {
        const ex = new Exchange('KRAKEN')
        expect(ex.id).to.equal('kraken')
    })

    it('should have a readable toString', () => {
        const ex = new Exchange('coinbase')
        expect(ex.toString()).to.equal('coinbase')
    })
})
