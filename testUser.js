

var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var base = web3.eth.coinbase

var code = fs.readFileSync("contracts/TestUser.bin")
var abi = JSON.parse(fs.readFileSync("contracts/TestUser.abi"))

var send_opt = {from:base, gas: 4000000}

var contract = web3.eth.contract(abi)

var addresses = JSON.parse(fs.readFileSync("config.json"))

contract.new(addresses.tasks,
             "QmNmUEKZfMYxqiacPYxxSWXhpFD4JSKvuyk5ng967C8WrM",
             "0x6a2ff41d3d4ddade5937b0c69d5add2028d5555ee1bd69c3106b3464914574ff",
             {from: base, data: '0x' + code, gas: '5000000'},
             function (e, contract) {
    if (e) console.error(e)
    else if (typeof contract.address !== 'undefined') {
        console.log("made contract")
        // contract.debugStuff.call(send_opt, (err,args) => console.log(args[0].toString(16), args[1].toString(16)))
        contract.doStuff(send_opt, console.log)
        contract.Success("latest").watch(console.log)
    }
})


