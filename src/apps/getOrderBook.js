import { Command } from 'commander'
import BinanceOrderBookCollector from '../exchanges/BinanceOrderBookCollector.js'
import { resolveSymbol } from '../core/resolveSymbol.js'
import Watchdog from '../utils/Watchdog.js'

const opts = new Command()
    .name('getOrderBook')
    .description('Live-collect @depth@100ms diff-depth stream and append to per-day binary files')
    .requiredOption('-s, --symbol <exchange:base:quote>', 'symbol (e.g. binance:eth:usdc)')
    .option('--scale-exp <n>', 'price/qty scale exponent (10^scaleExp)', (v) => parseInt(v), 8)
    .option('--snapshot-depth <n>', 'levels per side in snapshot records', (v) => parseInt(v), 1000)
    .option('--snapshot-interval <seconds>', 'in-day re-snapshot cadence', (v) => parseInt(v), 300)
    .option('--status-interval <seconds>', 'status print cadence', (v) => parseInt(v), 60)
    .option('--data-dir <path>', 'root directory for day files', 'data')
    .option('--data-watchdog <seconds>', 'pet systemd every N seconds iff data was written in the prev window', (v) => parseInt(v))
    .showHelpAfterError()
    .parse(process.argv)
    .opts()

const symbol = resolveSymbol(opts.symbol)

const collector = new BinanceOrderBookCollector({
    symbol,
    scaleExp: opts.scaleExp,
    snapshotDepth: opts.snapshotDepth,
    snapshotIntervalSec: opts.snapshotInterval,
    statusIntervalSec: opts.statusInterval,
    dataDir: opts.dataDir
})

console.log(`Symbol:    ${collector.symbol.id}`)
console.log(`WS URL:    ${collector.wsUrl}`)
console.log(`REST URL:  ${collector.restUrl}`)
console.log(`scaleExp=${collector.scaleExp}, snapshotDepth=${collector.snapshotDepth}, snapshotInterval=${collector.snapshotIntervalSec}s`)
console.log(`dataWatchdog=${opts.dataWatchdog ? opts.dataWatchdog + 's' : 'off'}`)
console.log('Press Ctrl+C to stop (will flush the current day\'s file).')

const shutdown = async (signal) => {
    await collector.stop(signal)
    process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

collector.start()

// Pet systemd only if the writer made progress in the last opts.dataWatchdog
// seconds. When we stop petting, systemd's WatchdogSec= kills us and
// Restart=always brings us back. Disabled unless --data-watchdog is given.
if (opts.dataWatchdog) {
    const wd = new Watchdog()
    let lastSeenWriteAt = 0
    setInterval(() => {
        const cur = collector.watchdogState
        if (cur && cur.lastWriteAtMs > lastSeenWriteAt) {
            wd.pet(`writeCallsCount=${cur.writeCallsCount}`)
            lastSeenWriteAt = cur.lastWriteAtMs
        }
    }, opts.dataWatchdog * 1000).unref()
}
