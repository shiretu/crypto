module.exports = {
    safeExec: async (fnc) => {
        try {
            await fnc()
        } catch (e) {
            console.error(e)
        }
    },
    bigIntSign: (x) => {
        return (x > 0n) - (x < 0n)
    },
    bigIntAbs: (x) => (x < 0n ? -x : x)
}
