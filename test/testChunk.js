
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

var provider = new web3.providers.HttpProvider('http://' + host + ':8545')

web3.setProvider(provider)

var code = fs.readFileSync("../contracts/compiled/Filesystem.bin")
var abi = JSON.parse(fs.readFileSync("../contracts/compiled/Filesystem.abi"))

function arrange(buf) {
    var res = []
    var arr = []
    for (var i = 0; i < buf.length; i++) {
        if (buf[i] > 15) arr.push(buf[i].toString(16))
        else arr.push("0" + buf[i].toString(16))
    }
    var acc = ""
    arr.forEach(function (b) { acc += b; if (acc.length == 64) { res.push("0x"+acc); acc = "" } })
    if (acc != "") res.push("0x"+acc)
    return res
}

async function doDeploy() {
    var accts = await web3.eth.getAccounts()
    var call_opt = {gas:40000000000, from:accts[0]}
    var send_opt = {gas:8000000, from:accts[0]}
    
    var fs = await new web3.eth.Contract(abi).deploy({data: "0x" + code}).send(send_opt)
    console.log("made contract " + fs.options.address)
    fs.setProvider(provider)
    var arr = []
    var sz = 11
    for (var i = 0; i < Math.pow(2,sz); i++) arr.push("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    console.log("should be", Math.pow(2,sz)*32, "bytes")
    var res = await fs.methods.addChunk(arr, sz).send(send_opt)

    console.log("got: ", res)
}

doDeploy()


