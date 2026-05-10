class RangesTreeNode {
    startIndex
    endIndex
    minValue
    maxValue
    level
    left
    right

    constructor (startIndex, endIndex, minValue, maxValue, level) {
        this.startIndex = startIndex
        this.endIndex = endIndex
        this.minValue = minValue
        this.maxValue = maxValue
        this.level = level
        this.left = null
        this.right = null
    }

    containsValue (value) {
        return value >= this.minValue && value <= this.maxValue
    }

    #buildLeaves (itemAtFn, valueFn) {
        if (this.level === 0) return
        if (this.startIndex === this.endIndex) return
        if (this.minValue === this.maxValue) return

        const mid = Math.floor((this.startIndex + this.endIndex) / 2)
        let splitIndex = null

        for (let offset = 0; offset <= Math.max(mid - this.startIndex, this.endIndex - mid); offset++) {
            const leftIdx = mid - offset
            if (leftIdx >= this.startIndex && leftIdx < this.endIndex && valueFn(itemAtFn(leftIdx)) !== valueFn(itemAtFn(leftIdx + 1))) {
                splitIndex = leftIdx
                break
            }
            if (offset > 0) {
                const rightIdx = mid + offset
                if (rightIdx >= this.startIndex && rightIdx < this.endIndex && valueFn(itemAtFn(rightIdx)) !== valueFn(itemAtFn(rightIdx + 1))) {
                    splitIndex = rightIdx
                    break
                }
            }
        }

        if (splitIndex === null) return

        this.left = RangesTreeNode.build(itemAtFn, valueFn, this.startIndex, splitIndex, this.level - 1)
        this.right = RangesTreeNode.build(itemAtFn, valueFn, splitIndex + 1, this.endIndex, this.level - 1)
    }

    static build (itemAtFn, valueFn, start, end, level) {
        if (start > end) throw new Error(`Invalid range: start (${start}) > end (${end})`)

        let minValue = Infinity
        let maxValue = -Infinity
        for (let i = start; i <= end; i++) {
            const v = valueFn(itemAtFn(i))
            if (v < minValue) minValue = v
            if (v > maxValue) maxValue = v
        }

        const node = new RangesTreeNode(start, end, minValue, maxValue, level)
        node.#buildLeaves(itemAtFn, valueFn)

        return node
    }
}

export default class RangesTree {
    #root
    #maxLevels

    constructor ({ collectionDescriptor: { itemAtFn, itemsCountFn, valueFn, firstIndexFn }, maxLevels = 10 }) {
        this.#maxLevels = maxLevels
        const firstIndex = firstIndexFn()
        this.#root = RangesTreeNode.build(itemAtFn, valueFn, firstIndex, firstIndex + itemsCountFn() - 1, maxLevels)
    }

    get root () { return this.#root }
    get maxLevels () { return this.#maxLevels }
}

export { RangesTreeNode }
