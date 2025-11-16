const { loadConfig } = require('../config')
const { cache } = require('../common/Cache')
const { progressBar } = require('../common/progressBar')

const work = async () => {
    const config = loadConfig('simple')
    const samples = await cache.samples(config)

    console.log('\n=== Sample Statistics ===')
    console.log(`Total samples: ${samples.length.toLocaleString()}`)

    // Initialize counters
    const stats = {
        buy: {
            total: 0,
            entered: 0,
            notEntered: 0,
            closed: 0,
            stopLoss: 0,
            takeProfit: 0,
            totalConfidence: 0,
            totalProfit: 0,
            totalProfitPercent: 0,
            closedCount: 0
        },
        sell: {
            total: 0,
            entered: 0,
            notEntered: 0,
            closed: 0,
            stopLoss: 0,
            takeProfit: 0,
            totalConfidence: 0,
            totalProfit: 0,
            totalProfitPercent: 0,
            closedCount: 0
        }
    }

    // Process all samples
    const bar = progressBar(`Analyzing ${samples.length.toLocaleString()} samples...`)
    bar.start(samples.length, 0)

    for (let i = 0; i < samples.length; i++) {
        const sample = samples.read(i)
        const [buyOutput, sellOutput] = sample.outputs

        // Process BUY order
        stats.buy.total++
        stats.buy.totalConfidence += Math.abs(buyOutput.confidence)
        if (buyOutput.enterPrice) {
            stats.buy.entered++
            if (buyOutput.isClosed) {
                stats.buy.closed++
                stats.buy.closedCount++
                stats.buy.totalProfit += buyOutput.profit
                stats.buy.totalProfitPercent += buyOutput.profitPercent
                if (buyOutput.isStopLossHit) {
                    stats.buy.stopLoss++
                } else {
                    stats.buy.takeProfit++
                }
            }
        } else {
            stats.buy.notEntered++
        }

        // Process SELL order
        stats.sell.total++
        stats.sell.totalConfidence += Math.abs(sellOutput.confidence)
        if (sellOutput.enterPrice) {
            stats.sell.entered++
            if (sellOutput.isClosed) {
                stats.sell.closed++
                stats.sell.closedCount++
                stats.sell.totalProfit += sellOutput.profit
                stats.sell.totalProfitPercent += sellOutput.profitPercent
                if (sellOutput.isStopLossHit) {
                    stats.sell.stopLoss++
                } else {
                    stats.sell.takeProfit++
                }
            }
        } else {
            stats.sell.notEntered++
        }

        if (i % 1000 === 0) bar.update(i)
    }
    bar.update(samples.length)
    bar.stop()

    // Print statistics
    const printOrderStats = (name, orderStats) => {
        console.log(`\n--- ${name} Orders ---`)
        console.log(`Total samples: ${orderStats.total.toLocaleString()}`)
        console.log(`Entered: ${orderStats.entered.toLocaleString()} (${(orderStats.entered / orderStats.total * 100).toFixed(2)}%)`)
        console.log(`Not entered: ${orderStats.notEntered.toLocaleString()} (${(orderStats.notEntered / orderStats.total * 100).toFixed(2)}%)`)

        if (orderStats.entered > 0) {
            console.log(`\nClosed: ${orderStats.closed.toLocaleString()} (${(orderStats.closed / orderStats.entered * 100).toFixed(2)}% of entered)`)
            console.log(`Open (hit max duration): ${(orderStats.entered - orderStats.closed).toLocaleString()}`)

            if (orderStats.closed > 0) {
                console.log(`\n  Stop-loss hit: ${orderStats.stopLoss.toLocaleString()} (${(orderStats.stopLoss / orderStats.closed * 100).toFixed(2)}%)`)
                console.log(`  Take-profit hit: ${orderStats.takeProfit.toLocaleString()} (${(orderStats.takeProfit / orderStats.closed * 100).toFixed(2)}%)`)
                console.log(`  Win rate: ${(orderStats.takeProfit / orderStats.closed * 100).toFixed(2)}%`)
                console.log(`\n  Avg profit/loss: ${(orderStats.totalProfit / orderStats.closedCount).toFixed(4)}`)
                console.log(`  Avg profit %: ${(orderStats.totalProfitPercent / orderStats.closedCount * 100).toFixed(4)}%`)
            }
        }

        console.log(`\nAvg confidence: ${(orderStats.totalConfidence / orderStats.total).toFixed(4)}`)
    }

    printOrderStats('BUY', stats.buy)
    printOrderStats('SELL', stats.sell)

    // Overall summary
    console.log('\n=== Overall Summary ===')
    const totalEntered = stats.buy.entered + stats.sell.entered
    const totalClosed = stats.buy.closed + stats.sell.closed
    const totalWins = stats.buy.takeProfit + stats.sell.takeProfit

    console.log(`Total orders entered: ${totalEntered.toLocaleString()}`)
    console.log(`Total orders closed: ${totalClosed.toLocaleString()} (${(totalClosed / totalEntered * 100).toFixed(2)}% of entered)`)
    if (totalClosed > 0) {
        console.log(`Overall win rate: ${(totalWins / totalClosed * 100).toFixed(2)}%`)
    }
}

work()
