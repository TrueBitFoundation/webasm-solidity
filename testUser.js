

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

contract.new({from: base, data: '0x' + code, gas: '5000000'}, addresses.tasks, function (e, judge) {
    if (e) console.error(e)
    if (typeof judge.address !== 'undefined') {
    }
})


