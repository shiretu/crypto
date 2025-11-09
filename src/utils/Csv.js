class Csv {
    #printFnc
    constructor () {
        this.#printFnc = (data) => this.#printCsvWithColumns(data)
    }

    print (data) {
        this.#printFnc(data)
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
        console.log(line)
    }

    #printCsvWithColumns (data) {
        const headers = Object.keys(data).join(',')
        console.log(headers)
        this.#printCsvWithoutColumns(data)
        this.#printFnc = (data) => this.#printCsvWithoutColumns(data)
    }
}

module.exports = Csv
