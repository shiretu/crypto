const fs = require('fs')
const path = require('path')
class Csv {
    #filePath
    #consoleOutput
    #printFnc

    constructor (filePath, consoleOutput) {
        this.#filePath = filePath
        this.#consoleOutput = consoleOutput
        this.#printFnc = (data) => this.#printCsvWithColumns(data)
    }

    print (data) {
        this.#printFnc(Object.entries(data).reduce((result, [k, v]) => {
            if (Array.isArray(v)) {
                return { ...result, ...Csv.#flatArray(k, v) }
            } else {
                return { ...result, [k]: v }
            }
        }, {}))
    }

    static #flatArray (name, arr) {
        return arr.reduce((result, current, index) => {
            if (index > 10) return result
            return { ...result, [`${name}_${index}`]: current }
        }, {})
    }

    #printCsvWithoutColumns (data) {
        const line = Object.values(data).map(v => {
            if (typeof v === 'number') {
                return Number.isInteger(v) ? v.toString() : v.toFixed(10)
            } else if (typeof v === 'string') {
                return `"${v.replace(/"/g, '""')}"`
            } else {
                return v
            }
        }).join(',')
        if (this.#filePath) { fs.appendFileSync(this.#filePath, line + '\n') }
        if (this.#consoleOutput) { console.log(line) }
    }

    #printCsvWithColumns (data) {
        const headers = Object.keys(data).join(',')
        if (this.#filePath) {
            if (!fs.existsSync(this.#filePath)) {
                fs.mkdirSync(path.dirname(this.#filePath), { recursive: true })
                fs.writeFileSync(this.#filePath, headers + '\n')
            }
        }
        if (this.#consoleOutput) { console.log(headers) }
        this.#printFnc = (data) => this.#printCsvWithoutColumns(data)
        this.#printFnc(data)
    }
}

module.exports = Csv
