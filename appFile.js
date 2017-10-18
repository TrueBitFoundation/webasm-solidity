
var fs = require('fs')

// Handling files

// output in binary, each element in array should have 32 bytes
function inputToBuffer(arr, sz) {
    var buf = Buffer.alloc(arr.length*32)
    for (var i = 0; i < arr.length; i++) {
        for (var j = 0; j < 32; j++) if (i*32 + j < sz) buf[i*32 + j] = parseInt(arr[i].substr(2+2*j, 2), 16)
    }
    return buf
}

function byte(x) {
//    var x = i.charCodeAt(0)
    return (x >= 16 ? "" : "0") + x.toString(16)
}

function bufferToInput(buf) {
    var len = Math.floor(buf.length/32) + 1
    var res = []
    // for (var i = 0; i < len; i++) res.push("0x0000000000000000000000000000000000000000000000000000000000000000")
    for (var i = 0; i < len; i++) {
        res.push("0x")
        for (var j = 0; j < 32; j++) {
            res[i] += byte(buf[i*32+j] || 0)
        }
    }
    return res
}

function getFile(contract, id, cont) {
    contract.getName(id, send_opt, function (err, name) {
        if (err) {
            console.log(err)
            return
        }
        contract.getData(id, send_opt, function (err,arr) {
            if (err) {
                console.log(err)
                return
            }
            contract.getByteSize(id, send_opt, function (err,sz) {
                if (err) {
                    console.log(err)
                    return
                }
                cont({data:inputToBuffer(arr, sz),name:name})
            })
        })
    })
}

function setFile(contract, id, buf, cont) {
    var arr = bufferToInput(buf)
    contract.setByteSize(id, buf.length, send_opt, function (err) {
        if (err) console.log(err)
        else contract.setSize(id, arr.length, send_opt, function (err) {
            if (err) console.log(err)
            else contract.setLeafs(id, arr, 0, arr.length, send_opt, function (err) {
                if (err) console.log(err)
                else cont()
            })
        })
    })
}

// Cannot get the ID so easily ...
// get nonce: web3.eth.getTransactionCount(web3.eth.coinbase)
function createFile(contract, name, buf, cont) {
    var arr = bufferToInput(buf)
    var nonce = web3.eth.getTransactionCount(web3.eth.coinbase)
    contract.createFileWithContents(name, nonce, arr, buf.length, send_opt, function (err) {
        if (err) console.log(err)
        else contract.calcId(nonce, send_opt, function (err, id) {
            if (err) console.log(err)
            else cont(id)
        })
    })
}

var web3
var send_opt

function configure(w) {
    web3 = w
    var base = web3.eth.coinbase
    send_opt = {from:base, gas: 4000000}
}

exports.inputToBuffer = inputToBuffer
exports.getFile = getFile
exports.setFile = setFile
exports.createFile = createFile
exports.configure = configure

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
