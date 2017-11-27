
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.WebsocketProvider('http://' + host + ':8546'))

var code = fs.readFileSync("../contracts/compiled/Test.bin")
var abi = JSON.parse(fs.readFileSync("../contracts/compiled/Test.abi"))

var addresses = JSON.parse(fs.readFileSync("config.json"))

async function doDeploy() {
    var accts = await web3.eth.getAccounts()
    var call_opt = {gas:40000000000, from:accts[0]}
    var send_opt = {gas:4000000, from:accts[0]}
    
    var contract = await new web3.eth.Contract(abi).deploy({data: "0x" + code}).send(send_opt)
    console.log("made contract " + contract.options.address)
    var res = await contract.methods.test2().call(call_opt)
    
    console.log("got: " + res)
}

doDeploy()
