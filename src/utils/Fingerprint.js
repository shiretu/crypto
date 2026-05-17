import crypto from 'crypto'

/**
 * Stable short hash of a JSON-serialisable value.
 * Object keys are sorted recursively before hashing, so two objects with the
 * same content but different key order produce the same fingerprint.
 */
export default class Fingerprint {
    /**
     * @param {*} value - any JSON-serialisable value
     * @returns {string} first 16 hex chars of SHA-256 over the canonicalised JSON
     */
    static compute (value) {
        return crypto.createHash('sha256').update(JSON.stringify(Fingerprint.#canonicalize(value))).digest('hex').slice(0, 16)
    }

    static #canonicalize (obj) {
        if (obj === null || typeof obj !== 'object') return obj
        if (Array.isArray(obj)) return obj.map(Fingerprint.#canonicalize)
        return Object.keys(obj).sort().reduce((acc, key) => {
            acc[key] = Fingerprint.#canonicalize(obj[key])
            return acc
        }, {})
    }
}
