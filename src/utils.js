module.exports = {
    safeExec: async (fnc) => {
        try {
            await fnc()
        } catch (e) {
            console.error(e)
        }
    }
}
