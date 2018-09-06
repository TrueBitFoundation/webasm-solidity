
const Web3 = require("../web3.js/packages/web3")
const web3 = new Web3()
const fs = require("fs")

var ipfsAPI = require('ipfs-api')

var config = JSON.parse(fs.readFileSync("config.json"))

var host = config.host || "localhost"
var ipfshost = config.ipfshost || host

const mongoose = require('mongoose')
mongoose.connect('mongodb://localhost/truebit')

const File = mongoose.model('File', { root: String, data: String })

var ipfs = ipfsAPI(ipfshost, '5001', {protocol: 'http'})

web3.setProvider(new web3.providers.WebsocketProvider('ws://' + host + ':8546'))

const contract_dir = "../compiled/"

var send_opt = {gas:4700000, from:config.base}

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
    var hash = await fs.methods.combineChunks(acc, 10, bufferSize(chunks.length)).call(send_opt)
    console.log(res)
    // still have to make this into file id
    var res = await fs.methods.fileFromChunk("block.data", hash, buf.length).send(send_opt)
    var file_id = await fs.methods.fileFromChunk("block.data", hash, buf.length).call(send_opt)
    return {hash: hash, file_id: file_id, size: buf.length}
}

function createContract(name, addr) {
    var abi = JSON.parse(fs.readFileSync(contract_dir + name + ".abi"))
    return new web3.eth.Contract(abi, addr)
}

var filesystem = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "Filesystem.abi")), config.fs)
var ipfs_store = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "Ipfs.abi")), config.ipfs)
var ipfs_load = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "IpfsLoad.abi")), config.ipfs_load)

async function readData(hash) {
    var asd = await File.find({root: hash})
    return asd[0].data
}

// Load a block to ipfs contracts
async function handleIpfsLoad(ev) {
    var id = ev.returnValues.id
    var root = ev.returnValues.state
    var fname = await readData(root)
    
    ipfs_load.methods.resolveName(id, fname, 6).send(send_opt)
    
    var bl = await ipfs.block.get(fname)
    var obj = await uploadBuffer(filesystem, bl.data)
    ipfs_store.methods.submitBlock(obj.file_id).send(send_opt)
    var pollBlock = async function () {
        var res = ipfs_store.methods.load(fname).call(send_opt)
        if (parseInt(res) != 0) ipfs_load.methods.resolveBlock(id, obj.hash, obj.size)
    }
    setInterval(pollBlock, 3000)
}

async function main() {
    ipfs_load.events.LoadToIpfs((err,ev) => handleIpfsLoad(ev))
    
    console.log("Listening events")
}

main()



