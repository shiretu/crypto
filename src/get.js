const fs = require('fs')
const path = require('path')
const promisify = require('util').promisify
const readFile = promisify(fs.readFile)

const rootFolder = path.resolve(__dirname, '..')
const dataFolder = path.resolve(rootFolder, 'data')
const downloadFolder = path.resolve(dataFolder, 'downloaded')
const csvFolder = path.resolve(downloadFolder, 'csv')
const zipFolder = path.resolve(downloadFolder, 'zip')
const tmpFolder = path.resolve(downloadFolder, 'tmp')

const download = (url, dstPath) => {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true })
        const file = fs.createWriteStream(dstPath)
        const protocol = url.startsWith('https') ? require('https') : require('http')
        protocol.get(url, response => {
            response.pipe(file)
            file.on('finish', () => {
                file.close(() => {
                    resolve()
                })
            })
        }).on('error', err => {
            reject(err)
        })
    })
}

const downloadAndCheck = async (info) => {
    if (fs.existsSync(info.zipFilePath)) { return }
    const plan = [[info.link, info.tmpFilePath], [`${info.link}.CHECKSUM`, `${info.tmpFilePath}.CHECKSUM`]]
    await Promise.all(plan.map(([link, path]) => download(link, path)))
    const expectedSha256 = (await readFile(`${info.tmpFilePath}.CHECKSUM`, { encoding: 'ascii' })).split(' ')[0]
    const fileBuffer = await readFile(info.tmpFilePath)
    const computedSha256 = require('crypto').createHash('sha256')
    computedSha256.update(fileBuffer)
    const computedHash = computedSha256.digest('hex')
    if (computedHash !== expectedSha256) {
        throw new Error(`Checksum mismatch for ${info.tmpFilePath}: expected ${expectedSha256}, got ${computedHash}`)
    } else {
        console.log(`Checksum verified for ${info.tmpFilePath}`)
        fs.renameSync(info.tmpFilePath, info.zipFilePath)
        fs.unlinkSync(`${info.tmpFilePath}.CHECKSUM`)
    }
}

const work = async () => {
    const linksPath = path.resolve(dataFolder, 'links.txt')
    const links = fs.readFileSync(linksPath, 'utf-8').split('\n')
        .filter(link => link.endsWith('.zip'))
        .map(link => {
            const zipFileName = link.split('/').pop()
            const fileNameNoExt = zipFileName.replace('.zip', '')
            const csvFileName = `${fileNameNoExt}.csv`
            return {
                link,
                tmpFilePath: path.resolve(tmpFolder, zipFileName),
                zipFilePath: path.resolve(zipFolder, zipFileName),
                csvFilePath: path.resolve(csvFolder, csvFileName)
            }
        })
        .filter(info => {
            return !fs.existsSync(info.csvFilePath)
        })

    fs.mkdirSync(downloadFolder, { recursive: true })

    await Promise.all(links.map(downloadAndCheck))
}

work()
