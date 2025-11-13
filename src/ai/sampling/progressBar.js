const cliProgress = require('cli-progress')

/**
 * Creates a configured progress bar with proper ETA estimation
 * @param {string} [message] - Optional message to log before the progress bar
 * @returns {cliProgress.SingleBar} Configured progress bar instance
 */
const progressBar = (message) => {
    if (message) {
        console.log(message)
    }

    const startTime = Date.now()

    return new cliProgress.SingleBar({
        format: (options, params, payload) => {
            const bar = options.barCompleteString.substring(0, Math.round(params.progress * options.barsize)) +
                       options.barIncompleteString.substring(0, Math.round((1 - params.progress) * options.barsize))

            // Calculate ETA properly: (elapsed time / progress) * (1 - progress)
            const elapsed = (Date.now() - startTime) / 1000 // seconds
            const eta = params.progress > 0 ? Math.round((elapsed / params.progress) * (1 - params.progress)) : 0

            const percentage = Math.round(params.progress * 100)

            return `\x1b[36m⚡\x1b[0m [\x1b[32m${bar}\x1b[0m] \x1b[33m${percentage}%\x1b[0m | \x1b[35mETA: ${eta}s\x1b[0m | \x1b[36m${params.value}\x1b[0m/\x1b[36m${params.total}\x1b[0m`
        },
        barCompleteChar: '●',
        barIncompleteChar: '○',
        hideCursor: true,
        barsize: 40
    })
}

module.exports = { progressBar }
