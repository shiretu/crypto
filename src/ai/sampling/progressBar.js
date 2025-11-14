const cliProgress = require('cli-progress')

/**
 * Dummy progress bar that does nothing (used in tests)
 */
class NoOpProgressBar {
    start () {}
    update () {}
    increment () {}
    stop () {}
}

/**
 * Wrapper around cli-progress SingleBar with standardized interface
 */
class ProgressBar {
    #bar

    constructor (bar) {
        this.#bar = bar
    }

    start (total, startValue = 0) {
        this.#bar.start(total, startValue)
    }

    update (value) {
        this.#bar.update(value)
    }

    increment (delta = 1) {
        this.#bar.increment(delta)
    }

    stop () {
        this.#bar.stop()
    }
}

/**
 * Creates a configured progress bar with proper ETA estimation
 * @param {string} [message] - Optional message to log before the progress bar
 * @returns {ProgressBar} Configured progress bar instance
 */
const progressBar = (message) => {
    // Detect if running in test environment
    const isTest = process.env.NODE_ENV === 'test' ||
                   (typeof global.it === 'function' && typeof global.describe === 'function')

    if (isTest) {
        return new ProgressBar(new NoOpProgressBar())
    }

    if (message) {
        console.log(message)
    }

    const startTime = Date.now()

    const bar = new cliProgress.SingleBar({
        format: (options, params, payload) => {
            const bar = options.barCompleteString.substring(0, Math.round(params.progress * options.barsize)) +
                       options.barIncompleteString.substring(0, Math.round((1 - params.progress) * options.barsize))
            const elapsed = Date.now() - startTime
            const eta = Math.floor((params.total * elapsed / params.value - elapsed) / 1000)
            const percentage = Math.round(params.progress * 100)
            return `\x1b[36m⚡\x1b[0m [\x1b[32m${bar}\x1b[0m] \x1b[33m${percentage}%\x1b[0m | \x1b[35mETA: ${Math.floor(eta / 60)}m${eta % 60}s\x1b[0m | \x1b[36m${params.value}\x1b[0m/\x1b[36m${params.total}\x1b[0m`
        },
        barCompleteChar: '●',
        barIncompleteChar: '○',
        hideCursor: true,
        barsize: 40
    })

    return new ProgressBar(bar)
}

module.exports = { progressBar }
