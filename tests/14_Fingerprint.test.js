import { expect } from 'chai'
import Fingerprint from '../src/utils/Fingerprint.js'

describe('Fingerprint', () => {
    describe('compute', () => {
        it('should return a 16-character lowercase hex string', () => {
            const fp = Fingerprint.compute({ a: 1 })
            expect(fp).to.be.a('string')
            expect(fp).to.have.lengthOf(16)
            expect(fp).to.match(/^[0-9a-f]{16}$/)
        })

        it('should be deterministic for the same input', () => {
            const a = Fingerprint.compute({ x: 1, y: 'two', z: [1, 2, 3] })
            const b = Fingerprint.compute({ x: 1, y: 'two', z: [1, 2, 3] })
            expect(a).to.equal(b)
        })

        it('should be insensitive to top-level key order', () => {
            const a = Fingerprint.compute({ a: 1, b: 2, c: 3 })
            const b = Fingerprint.compute({ c: 3, b: 2, a: 1 })
            expect(a).to.equal(b)
        })

        it('should be insensitive to nested key order', () => {
            const a = Fingerprint.compute({ outer: { a: 1, b: 2 }, other: 3 })
            const b = Fingerprint.compute({ other: 3, outer: { b: 2, a: 1 } })
            expect(a).to.equal(b)
        })

        it('should preserve array order (arrays are not sorted)', () => {
            const a = Fingerprint.compute({ list: [1, 2, 3] })
            const b = Fingerprint.compute({ list: [3, 2, 1] })
            expect(a).to.not.equal(b)
        })

        it('should differ when any value changes', () => {
            const base = Fingerprint.compute({ a: 1, b: 2 })
            const tweaked = Fingerprint.compute({ a: 1, b: 3 })
            expect(base).to.not.equal(tweaked)
        })

        it('should differ when a key is added', () => {
            const base = Fingerprint.compute({ a: 1 })
            const extra = Fingerprint.compute({ a: 1, b: 2 })
            expect(base).to.not.equal(extra)
        })

        it('should distinguish null from undefined-via-missing-key', () => {
            const withNull = Fingerprint.compute({ a: 1, b: null })
            const withoutKey = Fingerprint.compute({ a: 1 })
            expect(withNull).to.not.equal(withoutKey)
        })

        it('should distinguish number from string of same digits', () => {
            const num = Fingerprint.compute({ x: 1 })
            const str = Fingerprint.compute({ x: '1' })
            expect(num).to.not.equal(str)
        })

        it('should hash deeply nested structures consistently', () => {
            const a = Fingerprint.compute({ a: { b: { c: { d: [1, { e: 2 }] } } } })
            const b = Fingerprint.compute({ a: { b: { c: { d: [1, { e: 2 }] } } } })
            expect(a).to.equal(b)
        })

        it('should accept top-level primitives', () => {
            expect(Fingerprint.compute(42)).to.match(/^[0-9a-f]{16}$/)
            expect(Fingerprint.compute('hello')).to.match(/^[0-9a-f]{16}$/)
            expect(Fingerprint.compute(true)).to.match(/^[0-9a-f]{16}$/)
            expect(Fingerprint.compute(null)).to.match(/^[0-9a-f]{16}$/)
        })

        it('should accept top-level arrays', () => {
            const a = Fingerprint.compute([1, 2, 3])
            const b = Fingerprint.compute([1, 2, 3])
            expect(a).to.equal(b)
            expect(a).to.match(/^[0-9a-f]{16}$/)
        })

        it('should distinguish empty object from empty array', () => {
            expect(Fingerprint.compute({})).to.not.equal(Fingerprint.compute([]))
        })
    })
})
