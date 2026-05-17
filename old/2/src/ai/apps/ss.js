const { loadConfig } = require('../config')
const { cache } = require('../common/Cache')
const { progressBar } = require('../common/progressBar')

const work = async () => {
    const config = loadConfig('simple')
    const samples = await cache.samples(config)

    console.log('\n=== Sample Statistics by Signal Strength ===')
    console.log(`Total samples: ${samples.length.toLocaleString()}`)

    // Initialize counters for 6 categories (using sample.signalCategory)
    // Each sample contributes to exactly ONE category (the dominant signal)
    const createCategoryStats = () => ({
        count: 0,
        totalProfit: 0,
        entered: 0,
        closed: 0,
        stopLoss: 0,
        takeProfit: 0
    })

    const categoryNames = [
        'BUY STRONG (confidence > 0.5)',
        'BUY FAILED (confidence < -0.5)',
        'BUY WEAK (-0.5 to 0.5)',
        'SELL STRONG (confidence > 0.5)',
        'SELL FAILED (confidence < -0.5)',
        'SELL WEAK (-0.5 to 0.5)'
    ]

    const stats = [
        createCategoryStats(), // 0: BUY_STRONG
        createCategoryStats(), // 1: BUY_FAILED
        createCategoryStats(), // 2: BUY_WEAK
        createCategoryStats(), // 3: SELL_STRONG
        createCategoryStats(), // 4: SELL_FAILED
        createCategoryStats() // 5: SELL_WEAK
    ]

    // Process all samples
    const bar = progressBar(`Analyzing ${samples.length.toLocaleString()} samples...`)
    bar.start(samples.length, 0)

    for (let i = 0; i < samples.length; i++) {
        const sample = samples.read(i)
        const category = sample.signalCategory // 0-5
        const categoryStats = stats[category]
        const [buyOutput, sellOutput] = sample.outputs

        // Determine which output to use based on category
        const output = category <= 2 ? buyOutput : sellOutput

        // Update stats for this category
        categoryStats.count++
        if (output.enterPrice) {
            categoryStats.entered++
            if (output.isClosed) {
                categoryStats.closed++
                categoryStats.totalProfit += output.profit
                if (output.isStopLossHit) {
                    categoryStats.stopLoss++
                } else {
                    categoryStats.takeProfit++
                }
            }
        }

        if (i % 1000 === 0) bar.update(i)
    }
    bar.update(samples.length)
    bar.stop()

    // Print statistics for each category
    const printCategoryStats = (name, categoryStats) => {
        console.log(`\n--- ${name} ---`)
        console.log(`Samples: ${categoryStats.count.toLocaleString()} (${(categoryStats.count / samples.length * 100).toFixed(2)}% of ${samples.length.toLocaleString()})`)

        if (categoryStats.entered > 0) {
            console.log(`Entered: ${categoryStats.entered.toLocaleString()} (${(categoryStats.entered / categoryStats.count * 100).toFixed(2)}%)`)
            console.log(`Closed: ${categoryStats.closed.toLocaleString()} (${(categoryStats.closed / categoryStats.entered * 100).toFixed(2)}% of entered)`)

            if (categoryStats.closed > 0) {
                const winRate = (categoryStats.takeProfit / categoryStats.closed * 100).toFixed(2)
                console.log(`  Stop-loss: ${categoryStats.stopLoss.toLocaleString()} (${(categoryStats.stopLoss / categoryStats.closed * 100).toFixed(2)}%)`)
                console.log(`  Take-profit: ${categoryStats.takeProfit.toLocaleString()} (${(categoryStats.takeProfit / categoryStats.closed * 100).toFixed(2)}%)`)
                console.log(`  Win rate: ${winRate}%`)
                console.log(`  Avg profit: ${(categoryStats.totalProfit / categoryStats.closed).toFixed(4)} USDC`)
            }
        } else {
            console.log('Entered: 0 (0.00%)')
        }
    }

    console.log('\n=== Signal Strength Categories (Dominant Signal per Sample) ===')
    categoryNames.forEach((name, index) => {
        printCategoryStats(name, stats[index])
    })

    // Overall summary
    console.log('\n=== Overall Summary ===')
    const totalEntered = stats.reduce((sum, cat) => sum + cat.entered, 0)
    const totalClosed = stats.reduce((sum, cat) => sum + cat.closed, 0)
    const totalWins = stats.reduce((sum, cat) => sum + cat.takeProfit, 0)

    // Strong vs Weak signal distribution
    const strongSamples = stats[0].count + stats[3].count // BUY_STRONG + SELL_STRONG
    const failedSamples = stats[1].count + stats[4].count // BUY_FAILED + SELL_FAILED
    const weakSamples = stats[2].count + stats[5].count // BUY_WEAK + SELL_WEAK

    console.log(`Total samples: ${samples.length.toLocaleString()}`)
    console.log(`Strong signals: ${strongSamples.toLocaleString()} (${(strongSamples / samples.length * 100).toFixed(2)}%)`)
    console.log(`Failed signals: ${failedSamples.toLocaleString()} (${(failedSamples / samples.length * 100).toFixed(2)}%)`)
    console.log(`Weak signals: ${weakSamples.toLocaleString()} (${(weakSamples / samples.length * 100).toFixed(2)}%)`)
    console.log(`Total entered: ${totalEntered.toLocaleString()}`)
    console.log(`Total closed: ${totalClosed.toLocaleString()} (${(totalClosed / totalEntered * 100).toFixed(2)}% of entered)`)
    if (totalClosed > 0) {
        console.log(`Overall win rate: ${(totalWins / totalClosed * 100).toFixed(2)}%`)
    }
}

work()
