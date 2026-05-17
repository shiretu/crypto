module.exports = {
    createModel: async (config) => {
        return require(`./${config.model.runner}/Model`).create(config)
    }
}
