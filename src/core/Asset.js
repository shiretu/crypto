export default class Asset {
    #id

    constructor (id) {
        this.#id = id.toLowerCase()
    }

    get id () { return this.#id }

    toString () {
        return this.#id.toUpperCase()
    }
}
