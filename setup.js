
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var config = JSON.parse(fs.readFileSync(process.argv[2]))

web3.setProvider(new web3.providers.WebsocketProvider('ws://' + config.host + ':8546'))

async function main() {
    var accts = await web3.eth.getAccounts()
    config.base = accts[0].toLowerCase()
    console.log(JSON.stringify(config))
    process.exit(0)
}

main()


