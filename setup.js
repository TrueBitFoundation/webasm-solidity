
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var config = JSON.parse(fs.readFileSync("setup.json"))

web3.setProvider(new web3.providers.WebsocketProvider('http://' + config.host + ':8546'))

async function main() {
    var accts = await web3.eth.getAccounts()
    console.log(JSON.stringify(accts[0]))
    process.exit(0)
}

main()


