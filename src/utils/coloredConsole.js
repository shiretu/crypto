const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    blue: '\x1b[34m'
}

const colorLog = (c, ...args) => console.log(c, ...args, COLORS.reset)

module.exports = {
    ...console,
    RESET: COLORS.reset,
    RED: COLORS.red,
    YELLOW: COLORS.yellow,
    GREEN: COLORS.green,
    BLUE: COLORS.blue,
    color: colorLog,
    red: (...args) => colorLog(COLORS.red, ...args),
    yellow: (...args) => colorLog(COLORS.yellow, ...args),
    green: (...args) => colorLog(COLORS.green, ...args),
    blue: (...args) => colorLog(COLORS.blue, ...args)
}
