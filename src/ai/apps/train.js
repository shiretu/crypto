const { loadConfig } = require('../config')

const work = async () => {
    const config = loadConfig('simple')
    console.log(config)
}

work()
