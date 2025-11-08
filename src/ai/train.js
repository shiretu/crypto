const { loadConfig } = require('./common')

const work = async () => {
    const modelName = process.argv[2] || 'lstm'
    const config = await loadConfig(modelName)
    console.log(config)
}

work()
