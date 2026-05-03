import path from 'path'
import { dateStr } from './date.js'

const getFilePath = (dataDir, type, symbol, year, month, day, ...extra) => {
    return path.join(dataDir, type, symbol.exchange.id,
        `${symbol.base.id}${symbol.quote.id}`, ...extra.map(String), `${dateStr(year, month, day)}.bin`)
}

export { getFilePath }
