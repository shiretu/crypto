const TradeKind = require('../../core/TradeKind')

class Output {
    #raw /** @type {Float64Array} */

    constructor (raw) {
        this.#raw = raw
    }

    static createFromRaw (raw) {
        return new Output(raw)
    }

    get kind () { return (this.#raw[0] === TradeKind.hold.value) ? TradeKind.hold : (this.#raw[0] === TradeKind.buy.value ? TradeKind.buy : TradeKind.sell) }
    get isClosed () { return this.#raw[1] === 1 }
    get isStopLossHit () { return this.#raw[2] === 1 }
    get profit () { return this.#raw[3] }
    get enterPrice () { return this.#raw[4] }
    get ageUs () { return this.#raw[5] }
    get maxAgeUs () { return this.#raw[6] }
    get profitPercent () { return this.#raw[7] }
    get confidence () { return this.#raw[8] }
}

exports.Output = Output
