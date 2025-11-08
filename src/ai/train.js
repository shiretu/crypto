const { loadConfig, loadNn } = require('./common')

const work = async () => {
    const modelName = process.argv[2] || 'lstm'
    const config = await loadConfig(modelName)
    const nn = await loadNn(config)
    console.log(nn)
}

work()
