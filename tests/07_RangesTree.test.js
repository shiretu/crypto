import { expect } from 'chai'
import RangesTree from '../src/core/RangesTree.js'

const v = (value) => ({ value })
const valueFn = (item) => item.value
const makeItems = (values, baseIndex = 0) => values.map((val, i) => ({ value: val, index: baseIndex + i }))
const makeDescriptor = (items) => ({ itemAtFn: (i) => items[i], itemsCountFn: () => items.length, valueFn, firstIndexFn: () => items.length > 0 ? items[0].index : 0 })
const root = (items, levels = 10) => {
    const indexed = items.map((item, i) => ({ ...item, index: i }))
    return new RangesTree({ collectionDescriptor: makeDescriptor(indexed), maxLevels: levels }).root
}

describe('RangesTree', () => {
    describe('construction - basic', () => {
        it('should build from two items with different values', () => {
            const node = root([v(100), v(200)])
            expect(node.startIndex).to.equal(0)
            expect(node.endIndex).to.equal(1)
            expect(node.minValue).to.equal(100)
            expect(node.maxValue).to.equal(200)
            expect(node.level).to.equal(10)
        })

        it('should build a leaf from two items with same value', () => {
            const node = root([v(50), v(50)])
            expect(node.minValue).to.equal(50)
            expect(node.maxValue).to.equal(50)
            expect(node.left).to.be.null
            expect(node.right).to.be.null
        })

        it('should build a leaf from a single item', () => {
            const node = root([v(42)])
            expect(node.startIndex).to.equal(0)
            expect(node.endIndex).to.equal(0)
            expect(node.minValue).to.equal(42)
            expect(node.maxValue).to.equal(42)
            expect(node.left).to.be.null
            expect(node.right).to.be.null
        })

        it('should build a leaf when all items have the same value', () => {
            const node = root([v(100), v(100), v(100), v(100), v(100)])
            expect(node.minValue).to.equal(100)
            expect(node.maxValue).to.equal(100)
            expect(node.left).to.be.null
            expect(node.right).to.be.null
        })
    })

    describe('construction - splitting', () => {
        it('should split two different-value items into left and right', () => {
            const node = root([v(100), v(200)])
            expect(node.left).to.not.be.null
            expect(node.right).to.not.be.null
            expect(node.left.startIndex).to.equal(0)
            expect(node.left.endIndex).to.equal(0)
            expect(node.left.minValue).to.equal(100)
            expect(node.left.maxValue).to.equal(100)
            expect(node.right.startIndex).to.equal(1)
            expect(node.right.endIndex).to.equal(1)
            expect(node.right.minValue).to.equal(200)
            expect(node.right.maxValue).to.equal(200)
        })

        it('should split at midpoint when values change there', () => {
            const node = root([v(100), v(100), v(200), v(200)])
            expect(node.left.startIndex).to.equal(0)
            expect(node.left.endIndex).to.equal(1)
            expect(node.left.minValue).to.equal(100)
            expect(node.left.maxValue).to.equal(100)
            expect(node.right.startIndex).to.equal(2)
            expect(node.right.endIndex).to.equal(3)
            expect(node.right.minValue).to.equal(200)
            expect(node.right.maxValue).to.equal(200)
        })

        it('should search outward from midpoint to find split', () => {
            const node = root([v(100), v(200), v(300), v(300), v(300), v(400)])
            expect(node.left.endIndex).to.equal(1)
            expect(node.right.startIndex).to.equal(2)
        })

        it('should search outward rightward when left side has same values', () => {
            const node = root([v(100), v(100), v(100), v(100), v(200), v(300)])
            expect(node.left.endIndex).to.equal(3)
            expect(node.right.startIndex).to.equal(4)
        })

        it('should not create single-element children unnecessarily', () => {
            const node = root([v(10), v(20)])
            expect(node.left.startIndex).to.equal(0)
            expect(node.left.endIndex).to.equal(0)
            expect(node.left.left).to.be.null
            expect(node.left.right).to.be.null
            expect(node.right.startIndex).to.equal(1)
            expect(node.right.endIndex).to.equal(1)
            expect(node.right.left).to.be.null
            expect(node.right.right).to.be.null
        })
    })

    describe('construction - levels', () => {
        it('should set root level to maxLevels', () => {
            const node = root([v(100), v(200)], 5)
            expect(node.level).to.equal(5)
        })

        it('should decrement level for children', () => {
            const node = root([v(100), v(200)], 5)
            expect(node.left.level).to.equal(4)
            expect(node.right.level).to.equal(4)
        })

        it('should stop splitting at level 0', () => {
            const node = root([v(10), v(20), v(30), v(40)], 1)
            expect(node.level).to.equal(1)
            expect(node.left).to.not.be.null
            expect(node.right).to.not.be.null
            expect(node.left.level).to.equal(0)
            expect(node.right.level).to.equal(0)
            expect(node.left.left).to.be.null
            expect(node.left.right).to.be.null
            expect(node.right.left).to.be.null
            expect(node.right.right).to.be.null
        })

        it('should stop splitting at level 0 even with many value changes', () => {
            const node = root([v(10), v(20), v(30), v(40), v(50), v(60), v(70), v(80)], 0)
            expect(node.level).to.equal(0)
            expect(node.left).to.be.null
            expect(node.right).to.be.null
            expect(node.minValue).to.equal(10)
            expect(node.maxValue).to.equal(80)
        })

        it('should produce correct levels through 3 deep', () => {
            const node = root([v(10), v(20), v(30), v(40), v(50), v(60), v(70), v(80)], 3)
            expect(node.level).to.equal(3)
            expect(node.left.level).to.equal(2)
            expect(node.right.level).to.equal(2)
            expect(node.left.left.level).to.equal(1)
            expect(node.left.right.level).to.equal(1)
        })
    })

    describe('construction - contiguity', () => {
        it('should have left.endIndex + 1 === right.startIndex', () => {
            const node = root([v(10), v(20), v(30), v(40), v(50), v(60)])
            expect(node.left.endIndex + 1).to.equal(node.right.startIndex)
        })

        it('should maintain contiguity at all levels', () => {
            const node = root([v(10), v(20), v(30), v(40), v(50), v(60), v(70), v(80)], 3)
            const checkContiguity = (n) => {
                if (!n || !n.left || !n.right) return
                expect(n.left.endIndex + 1).to.equal(n.right.startIndex)
                expect(n.left.startIndex).to.equal(n.startIndex)
                expect(n.right.endIndex).to.equal(n.endIndex)
                checkContiguity(n.left)
                checkContiguity(n.right)
            }
            checkContiguity(node)
        })

        it('should have children covering the full parent range', () => {
            const node = root([v(5), v(15), v(25), v(35), v(45)])
            expect(node.left.startIndex).to.equal(node.startIndex)
            expect(node.right.endIndex).to.equal(node.endIndex)
        })
    })

    describe('construction - min/max values', () => {
        it('should track correct min/max for left and right children', () => {
            const node = root([v(10), v(20), v(30), v(50), v(60), v(70)])
            expect(node.minValue).to.equal(10)
            expect(node.maxValue).to.equal(70)
            if (node.left) {
                expect(node.left.minValue).to.be.at.least(node.minValue)
                expect(node.left.maxValue).to.be.at.most(node.maxValue)
            }
            if (node.right) {
                expect(node.right.minValue).to.be.at.least(node.minValue)
                expect(node.right.maxValue).to.be.at.most(node.maxValue)
            }
        })

        it('should have min/max that reflect only their own range', () => {
            const node = root([v(100), v(50), v(200), v(300)])
            expect(node.minValue).to.equal(50)
            expect(node.maxValue).to.equal(300)
        })
    })

    describe('construction - gap between children', () => {
        it('should have a gap when left max < right min', () => {
            const node = root([v(10), v(20), v(50), v(60)])
            expect(node.left.maxValue).to.be.lessThan(node.right.minValue)
        })

        it('should have no gap when values are contiguous', () => {
            const node = root([v(10), v(20), v(20), v(30)])
            expect(node.left.endIndex).to.equal(0)
            expect(node.left.maxValue).to.equal(10)
            expect(node.right.startIndex).to.equal(1)
            expect(node.right.minValue).to.equal(20)
        })

        it('should detect a large gap between children', () => {
            const node = root([v(1), v(2), v(3), v(100), v(101), v(102)])
            const gap = node.right.minValue - node.left.maxValue
            expect(gap).to.be.greaterThan(0)
        })
    })

    describe('construction - edge cases', () => {
        it('should handle alternating values', () => {
            const node = root([v(10), v(20), v(10), v(20), v(10), v(20)])
            expect(node.minValue).to.equal(10)
            expect(node.maxValue).to.equal(20)
            expect(node.left).to.not.be.null
            expect(node.right).to.not.be.null
        })

        it('should handle descending values', () => {
            const node = root([v(100), v(90), v(80), v(70)])
            expect(node.minValue).to.equal(70)
            expect(node.maxValue).to.equal(100)
        })

        it('should handle a long run of same value then a change', () => {
            const node = root([v(50), v(50), v(50), v(50), v(50), v(50), v(50), v(100)])
            expect(node.left).to.not.be.null
            expect(node.right).to.not.be.null
            expect(node.left.endIndex).to.equal(6)
            expect(node.right.startIndex).to.equal(7)
            expect(node.left.minValue).to.equal(50)
            expect(node.left.maxValue).to.equal(50)
            expect(node.right.minValue).to.equal(100)
            expect(node.right.maxValue).to.equal(100)
        })

        it('should handle a change then a long run of same value', () => {
            const node = root([v(100), v(50), v(50), v(50), v(50), v(50), v(50), v(50)])
            expect(node.left).to.not.be.null
            expect(node.right).to.not.be.null
            expect(node.left.endIndex).to.equal(0)
            expect(node.right.startIndex).to.equal(1)
        })

        it('should handle three distinct value regions', () => {
            const node = root([v(10), v(10), v(50), v(50), v(90), v(90)])
            expect(node.minValue).to.equal(10)
            expect(node.maxValue).to.equal(90)
            expect(node.left.endIndex).to.equal(1)
            expect(node.left.minValue).to.equal(10)
            expect(node.left.maxValue).to.equal(10)
            expect(node.right.startIndex).to.equal(2)
            expect(node.right.minValue).to.equal(50)
            expect(node.right.maxValue).to.equal(90)
        })
    })

    describe('containsValue on nodes', () => {
        it('should return true for value within range', () => {
            const node = root([v(10), v(20), v(30)])
            expect(node.containsValue(15)).to.be.true
            expect(node.containsValue(10)).to.be.true
            expect(node.containsValue(30)).to.be.true
        })

        it('should return false for value outside range', () => {
            const node = root([v(10), v(20), v(30)])
            expect(node.containsValue(5)).to.be.false
            expect(node.containsValue(35)).to.be.false
        })

        it('should return true for exact min value', () => {
            const node = root([v(10), v(20)])
            expect(node.containsValue(10)).to.be.true
        })

        it('should return true for exact max value', () => {
            const node = root([v(10), v(20)])
            expect(node.containsValue(20)).to.be.true
        })

        it('should return true when all values are the same and querying that value', () => {
            const node = root([v(50), v(50), v(50)])
            expect(node.containsValue(50)).to.be.true
        })

        it('should return false when all values are the same and querying different value', () => {
            const node = root([v(50), v(50), v(50)])
            expect(node.containsValue(49)).to.be.false
            expect(node.containsValue(51)).to.be.false
        })
    })

    describe('RangesTree wrapper', () => {
        it('should expose root node', () => {
            const items = makeItems([10, 20])
            const tree = new RangesTree({ collectionDescriptor: makeDescriptor(items), maxLevels: 5 })
            expect(tree.root).to.not.be.null
            expect(tree.root.level).to.equal(5)
        })

        it('should expose maxLevels', () => {
            const items = makeItems([10, 20])
            const tree = new RangesTree({ collectionDescriptor: makeDescriptor(items), maxLevels: 7 })
            expect(tree.maxLevels).to.equal(7)
        })

        it('should default maxLevels to 10', () => {
            const items = makeItems([10, 20])
            const tree = new RangesTree({ collectionDescriptor: makeDescriptor(items) })
            expect(tree.maxLevels).to.equal(10)
        })

        it('should use indexFn for startIndex/endIndex with non-zero base', () => {
            const items = makeItems([10, 20, 30], 100)
            const desc = { itemAtFn: (i) => items[i - 100], itemsCountFn: () => items.length, valueFn, firstIndexFn: () => 100 }
            const tree = new RangesTree({ collectionDescriptor: desc, maxLevels: 10 })
            expect(tree.root.startIndex).to.equal(100)
            expect(tree.root.endIndex).to.equal(102)
        })
    })

    describe('construction - realistic volatile sequence', () => {
        it('should handle a realistic volatile sequence', () => {
            const values = [1500, 1502, 1498, 1495, 1510, 1508, 1520, 1515, 1530, 1525,
                1540, 1535, 1550, 1545, 1560, 1555]
            const node = root(values.map(val => v(val)), 4)

            expect(node.level).to.equal(4)
            expect(node.minValue).to.equal(Math.min(...values))
            expect(node.maxValue).to.equal(Math.max(...values))
            expect(node.startIndex).to.equal(0)
            expect(node.endIndex).to.equal(15)

            const verifyMinMax = (n) => {
                if (!n) return
                if (!n.left && !n.right) {
                    let min = Infinity; let max = -Infinity
                    for (let i = n.startIndex; i <= n.endIndex; i++) {
                        if (values[i] < min) min = values[i]
                        if (values[i] > max) max = values[i]
                    }
                    expect(n.minValue).to.equal(min)
                    expect(n.maxValue).to.equal(max)
                }
                verifyMinMax(n.left)
                verifyMinMax(n.right)
            }
            verifyMinMax(node)
        })

        it('should produce roughly balanced splits', () => {
            const trades = Array.from({ length: 1024 }, (_, i) => v(Math.sin(i / 10) * 100 + 500))
            const node = root(trades, 10)

            expect(node.left).to.not.be.null
            expect(node.right).to.not.be.null

            const leftSize = node.left.endIndex - node.left.startIndex + 1
            const rightSize = node.right.endIndex - node.right.startIndex + 1
            expect(leftSize + rightSize).to.equal(1024)
            expect(leftSize).to.be.greaterThan(200)
            expect(rightSize).to.be.greaterThan(200)
        })
    })

    describe('tree invariants', () => {
        it('should maintain all invariants on a complex tree', () => {
            const values = [100, 105, 98, 110, 95, 120, 88, 130, 85, 140,
                90, 135, 95, 125, 100, 115, 105, 110, 108, 112]
            const node = root(values.map(val => v(val)), 5)

            const checkInvariants = (n) => {
                if (!n) return

                let min = Infinity; let max = -Infinity
                for (let i = n.startIndex; i <= n.endIndex; i++) {
                    if (values[i] < min) min = values[i]
                    if (values[i] > max) max = values[i]
                }
                expect(n.minValue).to.equal(min, `min mismatch at [${n.startIndex},${n.endIndex}]`)
                expect(n.maxValue).to.equal(max, `max mismatch at [${n.startIndex},${n.endIndex}]`)

                if (n.left && n.right) {
                    expect(n.left.endIndex + 1).to.equal(n.right.startIndex)
                    expect(n.left.startIndex).to.equal(n.startIndex)
                    expect(n.right.endIndex).to.equal(n.endIndex)
                    expect(n.left.level).to.equal(n.level - 1)
                    expect(n.right.level).to.equal(n.level - 1)
                    expect(values[n.left.endIndex]).to.not.equal(values[n.right.startIndex])
                    expect(n.left.minValue).to.be.at.least(n.minValue)
                    expect(n.left.maxValue).to.be.at.most(n.maxValue)
                    expect(n.right.minValue).to.be.at.least(n.minValue)
                    expect(n.right.maxValue).to.be.at.most(n.maxValue)
                }

                checkInvariants(n.left)
                checkInvariants(n.right)
            }

            checkInvariants(node)
        })
    })
})
