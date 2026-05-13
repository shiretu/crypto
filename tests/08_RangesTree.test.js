import { expect } from 'chai'
import RangesTree from '../src/core/RangesTree.js'

const v = (value) => ({ value })
const valueFn = (item) => item.value
const makeItems = (values, baseIndex = 0) => values.map((val, i) => ({ value: val, index: baseIndex + i }))
const makeDescriptor = (items) => ({
    itemAtFn: (i) => items[i],
    itemsCountFn: () => items.length,
    valueFn,
    firstIndexFn: () => items.length > 0 ? items[0].index : 0
})
const root = (items, levels = 10) => {
    const indexed = items.map((item, i) => ({ ...item, index: i }))
    return new RangesTree({ collectionDescriptor: makeDescriptor(indexed), maxLevels: levels }).root
}
const tree = (items, levels = 10) => {
    const indexed = items.map((item, i) => ({ ...item, index: i }))
    return new RangesTree({ collectionDescriptor: makeDescriptor(indexed), maxLevels: levels })
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

        it('should not create children for single-element ranges', () => {
            const node = root([v(10), v(20)])
            expect(node.left.left).to.be.null
            expect(node.left.right).to.be.null
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
            expect(node.left.minValue).to.be.at.least(node.minValue)
            expect(node.left.maxValue).to.be.at.most(node.maxValue)
            expect(node.right.minValue).to.be.at.least(node.minValue)
            expect(node.right.maxValue).to.be.at.most(node.maxValue)
        })

        it('should have min/max that reflect only the node range', () => {
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
            expect(node.left.endIndex).to.equal(6)
            expect(node.right.startIndex).to.equal(7)
            expect(node.left.minValue).to.equal(50)
            expect(node.left.maxValue).to.equal(50)
            expect(node.right.minValue).to.equal(100)
            expect(node.right.maxValue).to.equal(100)
        })

        it('should handle a change then a long run of same value', () => {
            const node = root([v(100), v(50), v(50), v(50), v(50), v(50), v(50), v(50)])
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

        it('should handle negative values', () => {
            const node = root([v(-50), v(-10), v(-30), v(20)])
            expect(node.minValue).to.equal(-50)
            expect(node.maxValue).to.equal(20)
        })

        it('should handle floating-point values', () => {
            const node = root([v(1.5), v(2.7), v(0.3), v(5.1)])
            expect(node.minValue).to.equal(0.3)
            expect(node.maxValue).to.equal(5.1)
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
            const t = new RangesTree({ collectionDescriptor: makeDescriptor(items), maxLevels: 5 })
            expect(t.root).to.not.be.null
            expect(t.root.level).to.equal(5)
        })

        it('should expose maxLevels', () => {
            const items = makeItems([10, 20])
            const t = new RangesTree({ collectionDescriptor: makeDescriptor(items), maxLevels: 7 })
            expect(t.maxLevels).to.equal(7)
        })

        it('should default maxLevels to 10', () => {
            const items = makeItems([10, 20])
            const t = new RangesTree({ collectionDescriptor: makeDescriptor(items) })
            expect(t.maxLevels).to.equal(10)
        })

        it('should use firstIndexFn for startIndex/endIndex with non-zero base', () => {
            const items = makeItems([10, 20, 30], 100)
            const desc = {
                itemAtFn: (i) => items[i - 100],
                itemsCountFn: () => items.length,
                valueFn,
                firstIndexFn: () => 100
            }
            const t = new RangesTree({ collectionDescriptor: desc, maxLevels: 10 })
            expect(t.root.startIndex).to.equal(100)
            expect(t.root.endIndex).to.equal(102)
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
                }

                checkInvariants(n.left)
                checkInvariants(n.right)
            }

            checkInvariants(node)
        })

        it('should produce roughly balanced splits with realistic data', () => {
            const trades = Array.from({ length: 1024 }, (_, i) => v(Math.sin(i / 10) * 100 + 500))
            const node = root(trades, 10)
            const leftSize = node.left.endIndex - node.left.startIndex + 1
            const rightSize = node.right.endIndex - node.right.startIndex + 1
            expect(leftSize + rightSize).to.equal(1024)
            expect(leftSize).to.be.greaterThan(200)
            expect(rightSize).to.be.greaterThan(200)
        })
    })

    describe('search', () => {
        it('should return null when value is outside range', () => {
            const t = tree([v(10), v(20), v(30)])
            expect(t.search(5)).to.be.null
            expect(t.search(35)).to.be.null
        })

        it('should find exact value match', () => {
            const t = tree([v(10), v(20), v(30)])
            const result = t.search(20)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(20)
            expect(result[1].value).to.equal(20)
        })

        it('should find crossing where value jumps over target', () => {
            const t = tree([v(10), v(30)])
            const result = t.search(20)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(10)
            expect(result[1].value).to.equal(30)
        })

        it('should find crossing in descending sequence', () => {
            const t = tree([v(30), v(10)])
            const result = t.search(20)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(30)
            expect(result[1].value).to.equal(10)
        })

        it('should find first crossing in longer sequence', () => {
            const t = tree([v(10), v(15), v(25), v(30)])
            const result = t.search(20)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(15)
            expect(result[1].value).to.equal(25)
        })

        it('should find exact match at first element', () => {
            const t = tree([v(20), v(30), v(40)])
            const result = t.search(20)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(20)
        })

        it('should find exact match at last element', () => {
            const t = tree([v(10), v(20), v(30)])
            const result = t.search(30)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(30)
        })

        it('should find crossing in gap between children', () => {
            const t = tree([v(10), v(20), v(50), v(60)])
            const result = t.search(30)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(20)
            expect(result[1].value).to.equal(50)
        })

        it('should return null for value not in same-value tree', () => {
            const t = tree([v(50), v(50), v(50)])
            expect(t.search(60)).to.be.null
            expect(t.search(40)).to.be.null
        })

        it('should find exact match in same-value tree', () => {
            const t = tree([v(50), v(50), v(50)])
            const result = t.search(50)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(50)
            expect(result[1].value).to.equal(50)
        })
    })

    describe('search with startFromIndex', () => {
        it('should skip crossings before startFromIndex', () => {
            const t = tree([v(10), v(30), v(10), v(30)])
            const result = t.search(20, 2)
            expect(result).to.not.be.null
            expect(result[0].value).to.equal(10)
            expect(result[0].index).to.equal(2)
            expect(result[1].value).to.equal(30)
            expect(result[1].index).to.equal(3)
        })

        it('should find crossing starting exactly at startFromIndex', () => {
            const t = tree([v(10), v(30), v(10), v(30)])
            const result = t.search(20, 1)
            expect(result).to.not.be.null
            expect(result[0].index).to.be.at.least(1)
        })

        it('should return null when no crossing exists after startFromIndex', () => {
            const t = tree([v(10), v(30), v(50), v(50)])
            expect(t.search(20, 2)).to.be.null
        })

        it('should work with startFromIndex at 0 (same as no startFromIndex)', () => {
            const t = tree([v(10), v(30)])
            const withStart = t.search(20, 0)
            const withoutStart = t.search(20)
            expect(withStart[0].value).to.equal(withoutStart[0].value)
            expect(withStart[1].value).to.equal(withoutStart[1].value)
        })
    })

    describe('search result ordering invariant', () => {
        it('should return chronologically ordered results (index[0] <= index[1])', () => {
            const values = [100, 105, 98, 110, 95, 120, 88, 130, 85, 140]
            const t = tree(values.map(val => v(val)), 3)
            for (const target of [90, 95, 100, 105, 110, 115, 120, 125, 130]) {
                const result = t.search(target)
                if (result) {
                    expect(result[0].index).to.be.at.most(result[1].index, `target=${target}`)
                }
            }
        })

        it('should return adjacent items (index[1] - index[0] <= 1)', () => {
            const values = [100, 105, 98, 110, 95, 120, 88, 130, 85, 140]
            const t = tree(values.map(val => v(val)), 3)
            for (const target of [90, 95, 100, 105, 110, 115, 120, 125, 130]) {
                const result = t.search(target)
                if (result) {
                    const diff = result[1].index - result[0].index
                    expect(diff).to.be.at.most(1, `target=${target}`)
                }
            }
        })

        it('should preserve ordering with startFromIndex', () => {
            const values = [10, 30, 10, 30, 10, 30]
            const t = tree(values.map(val => v(val)), 3)
            for (let start = 0; start < values.length; start++) {
                const result = t.search(20, start)
                if (result) {
                    expect(result[0].index).to.be.at.most(result[1].index, `start=${start}`)
                    expect(result[0].index).to.be.at.least(start, `start=${start}`)
                }
            }
        })
    })
})
