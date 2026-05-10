import RangesTree from '../core/RangesTree.js'
import Trades from '../stores/Trades.js'
import { resolveSymbol } from '../core/resolveSymbol.js'
import Day from '../utils/Day.js'

const symbol = resolveSymbol('binance:eth:usdc')
const startDay = Day.fromStr('2025-03-10')

const tradesStore = new Trades('data', symbol)
await tradesStore.loadAsync(startDay, startDay)

const trades = tradesStore.getDay(startDay)
console.log(`Loaded ${trades.length} trades for ${Day.toStr(startDay)}`)

const collectionDescriptor = {
    itemAtFn: (i) => trades[i],
    itemsCountFn: () => trades.length,
    valueFn: (trade) => trade.price,
    firstIndexFn: () => 0
}

console.time('build tree')
const tree = new RangesTree({ collectionDescriptor, maxLevels: 12 })
console.timeEnd('build tree')

const root = tree.root
console.log(`Root: [${root.startIndex}..${root.endIndex}] min=${root.minValue} max=${root.maxValue} level=${root.level}`)
console.log(`Left: [${root.left.startIndex}..${root.left.endIndex}] min=${root.left.minValue} max=${root.left.maxValue}`)
console.log(`Right: [${root.right.startIndex}..${root.right.endIndex}] min=${root.right.minValue} max=${root.right.maxValue}`)

const countNodes = (node) => {
    if (!node) return { nodes: 0, leaves: 0 }
    const l = countNodes(node.left)
    const r = countNodes(node.right)
    const isLeaf = !node.left && !node.right
    return { nodes: 1 + l.nodes + r.nodes, leaves: (isLeaf ? 1 : 0) + l.leaves + r.leaves }
}

const stats = countNodes(root)
console.log(`Nodes: ${stats.nodes}, Leaves: ${stats.leaves}`)

const leafSizes = []
const collectLeafSizes = (node) => {
    if (!node) return
    if (!node.left && !node.right) { leafSizes.push(node.endIndex - node.startIndex + 1); return }
    collectLeafSizes(node.left)
    collectLeafSizes(node.right)
}
collectLeafSizes(root)
leafSizes.sort((a, b) => a - b)
console.log(`Leaf sizes: min=${leafSizes[0]} max=${leafSizes.at(-1)} median=${leafSizes[Math.floor(leafSizes.length / 2)]} avg=${Math.round(leafSizes.reduce((a, b) => a + b) / leafSizes.length)}`)
