
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var base = web3.eth.coinbase

var code = fs.readFileSync("contracts/Tasks.bin")
var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var code2 = fs.readFileSync("contracts/Interactive2.bin")
var abi2 = JSON.parse(fs.readFileSync("contracts/Interactive2.abi"))

var code3 = fs.readFileSync("contracts/Instruction.bin")
var abi3 = JSON.parse(fs.readFileSync("contracts/Instruction.abi"))

var send_opt = {from:base, gas: 4000000}

// var sol_testContract = new web3.eth.Contract(abi)
var contract = web3.eth.contract(abi)
var contract2 = web3.eth.contract(abi2)
var contract3 = web3.eth.contract(abi3)

contract3.new({from: base, data: '0x' + code3, gas: '5000000'}, function (e, judge) {
    if (e) console.error(e)
    if (typeof judge.address !== 'undefined') {
        contract2.new(judge.address, {from: base, data: '0x' + code2, gas: '4000000'}, function (e, contr) {
            if (e) console.error(e)
            if (typeof contr.address !== 'undefined') {
                contract.new(contr.address, {from: base, data: '0x' + code, gas: '4000000'}, function (e, contract){
                    if (e) console.error(e)
                    if (typeof contract.address !== 'undefined') {
                        console.log('{ "interactive": "' + contr.address + '", "tasks" : "' + contract.address + '" }')
                    }
                })
            }
        })
    }
})

