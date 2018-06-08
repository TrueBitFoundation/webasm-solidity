
const ipfsAPI = require('ipfs-api')
const fs = require("fs")

var ipfshost = "programming-progress.com"

var ipfs = ipfsAPI(ipfshost, '5001', {protocol: 'http'})

var obj = {}

function toHex(hash) {
    return Buffer.from(hash).toString("hex")
}

async function info(hash) {
    console.log("Checking", hash)
    var bl = await ipfs.block.get(hash)
    console.log("Data", bl.data.length, "bytes:", bl.data.toString("hex").substr(0,100))
    obj[toHex(hash)] = bl.data.toString("hex")
    var links = await ipfs.object.links(hash)
    for (var i = 0; i < links.length; i++) {
        var hash = links[i].toJSON().multihash
        await info(hash)
    }
}

async function main(hash) {
    await info(hash)
    fs.writeFileSync("custom.json", JSON.stringify(obj))
}

main(process.argv[2])

