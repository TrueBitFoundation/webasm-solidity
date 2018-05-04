
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var config = JSON.parse(fs.readFileSync(process.argv[2]))

if (config.ipc) {
    var net = require("net")
    web3.setProvider(new web3.providers.IpcProvider(config.ipc, net))
}
else web3.setProvider(new web3.providers.WebsocketProvider('http://' + config.host + ':8546'))

async function main() {
    var accts = await web3.eth.getAccounts()
    config.base = accts[0].toLowerCase()
    config.tick = false
    console.log(JSON.stringify(config))
    process.exit(0)
}

main()


