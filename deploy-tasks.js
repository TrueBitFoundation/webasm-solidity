
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

web3.setProvider(new web3.providers.HttpProvider('http://programming-progress.com:8545'))

var base = "0x9acbcf2d9bd157999ae5541c446f8d6962da1d4d"

var code = fs.readFileSync("contracts/Tasks.bin")
var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var code2 = fs.readFileSync("contracts/Tasks.bin")
var abi2 = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var send_opt = {from:base, gas: 4000000}

// var sol_testContract = new web3.eth.Contract(abi)
var contract = web3.eth.contract(abi)
var contract2 = web3.eth.contract(abi2)

/*
sol_testContract.deploy({data:"0x"+code}).send(send_opt).then(function (contract) {
  console.log('Contract mined! address: ' + contract.options.address)
})
*/
contract2.new({from: base, data: '0x' + code2, gas: '4000000'}, function (e, contr) {
    if (typeof contr.address !== 'undefined') {
        console.log('Contract mined! address: ' + contr.address);
        contract.new(contr.address, {from: base, data: '0x' + code, gas: '4000000'}, function (e, contract){
            if (typeof contract.address !== 'undefined') console.log('Contract mined! address: ' + contract.address);
        })
    }
})