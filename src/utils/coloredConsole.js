const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m'
}

const colorLog = (c, ...args) => console.log(c, ...args, COLORS.reset)

module.exports = {
    ...console,
    RED: COLORS.red,
    YELLOW: COLORS.yellow,
    GREEN: COLORS.green,
    color: colorLog,
    red: (...args) => colorLog(COLORS.red, ...args),
    yellow: (...args) => colorLog(COLORS.yellow, ...args),
    green: (...args) => colorLog(COLORS.green, ...args)
}
