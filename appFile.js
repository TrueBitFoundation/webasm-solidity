
var fs = require('fs')

// Handling files

// output in binary, each element in array should have 32 bytes
function inputToBuffer(arr) {
    var buf = Buffer.alloc(arr.length*32)
    for (var i = 0; i < arr.length; i++) {
        for (var j = 0; j < 32; j++) buf[i*32 + j] = parseInt(arr[i].substr(2+2*j, 2), 16)
    }
    return buf
}

function getFile(contract, id, cont) {
    contract.getName(id, function (err, name) {
        if (err) {
            console.log(err)
            return
        }
        contract.getData(id, function (err,arr) {
            if (err) {
                console.log(err)
                return
            }
            cont(inputToBuffer(arr))
        })
    })
}

exports.getFile = getFile

/*

var Web3 = require('web3')
var web3 = new Web3()
var host = "programming-progress.com"

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var base = web3.eth.coinbase

var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var addresses = JSON.parse(fs.readFileSync("config.json"))

var send_opt = {from:base, gas: 4000000}

var contractABI = web3.eth.contract(abi)
var contract = contractABI.at(addresses.tasks)

contract.createFile("test.bin", send_opt, console.log)

contract.setSize(0, 100, send_opt, console.log)

contract.getData(0)

*/
