
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = /*process.argv[2] || */ "localhost"

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

function bufferSize(n) {
    return Math.ceil(Math.log(n)/Math.log(2));
}

function completeArray(arr) {
    var tlen = Math.pow(2, bufferSize(arr.length));
    while (arr.length < tlen) arr.push(["0x00", "0x00"])
}

function chunkify(arr) {
    // make chunks of length 1024
    var res = []
    var acc = []
    for (var i = 0; i < arr.length; i++) {
        acc.push(arr[i])
        if (acc.length == 1024) {
            res.push(acc)
            acc = []
        }
    }
    if (acc.length > 0) res.push(acc.concat(["0x00", "0x00"]))
    completeArray(res)
    return res
}

var send_opt = {gas:8000000}

async function uploadBuffer(fs, buf) {
    var arr = arrange(buf)
    var chunks = chunkify(arr)
    var acc = []
    for (var i = 0; i < chunks.length; i++) {
        // console.log(arr)
        console.log("len", chunks[i].length)
        var hash = await fs.methods.addChunk(chunks[i], 10).call(send_opt)
        var res = await fs.methods.addChunk(chunks[i], 10).send(send_opt)
        console.log("got hash", hash, "tx", res)
        acc.push(hash)
    }
    if (chunks.length == 1) return
    console.log("Combining chunks")
    var res = await fs.methods.combineChunks(acc, 10, bufferSize(chunks.length)).send(send_opt)
    console.log(res)
    
}

function testChunks() {
    var arr = []
    var sz = 11
    
    // for (var i = 0; i < Math.pow(2,sz); i++) arr.push("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    for (var i = 0; i < Math.pow(2,sz)+100; i++) arr.push("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    console.log(chunkify(arr))

    /*
    console.log("should be", Math.pow(2,sz)*32, "bytes")
    var res = await fs.methods.addChunk(arr, sz).send(send_opt)
    console.log("got: ", res)
    */

}

async function doDeploy() {
    var accts = await web3.eth.getAccounts()
    var call_opt = {gas:4000000, from:accts[0]}
    send_opt.from = accts[0]
    
    var files = await new web3.eth.Contract(abi).deploy({data: "0x" + code}).send(send_opt)
    console.log("made contract " + files.options.address)
    files.setProvider(provider)
    
    uploadBuffer(files, fs.readFileSync(process.argv[2]))
    
}

doDeploy()


