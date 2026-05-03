module.exports = {
    randomIndices (min, max, count) {
        const result = new Set()
        while (result.size < count) {
            const index = Math.floor(Math.random() * (max - min + 1)) + min
            result.add(index)
        }
        return Array.from(result)
    }
}
