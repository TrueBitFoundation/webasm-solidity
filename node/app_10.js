
var fs = require("fs")
// var exec = require('child_process').exec
var http = require('http').createServer()
var io = require("socket.io")(http)
var Web3 = require('web3')
var web3 = new Web3('ws://programming-progress.com:8546')
var execFile = require('child_process').execFile
var ipfsAPI = require('ipfs-api')

// connect to ipfs daemon API server
var ipfs = ipfsAPI('programming-progress.com', '5001', {protocol: 'http'})

// web3.setProvider(new web3.providers.WebsocketProvider('ws://programming-progress.com:8546'))

var base = "0x9acbcf2d9bd157999ae5541c446f8d6962da1d4d"

var code = fs.readFileSync("contracts/Tasks.bin")
var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var send_opt = {from:base, gas: 4000000}

var contract = new web3.eth.Contract(abi, "0xEDc02d969AF38367B49DCB36b5A2ef7abb8A7fA4")

io.on("connection", function(socket) {
    console.log("Got client")
    io.emit("client", {})
    socket.on("msg", function (str) {
        console.log(str)
    })
    socket.on("new_task", function (obj) {
        console.log(obj)
        var arr = {path:"task.wast", content:new Buffer(obj)}
        // store into IPFS, get ipfs address
        ipfs.files.add(new Buffer(obj), function (err, res) {
            if (err) {
                console.log(err)
                return
            }
            console.log(res)
            var filename = res[0].hash + ".wast"
            // store into filesystem
            fs.writeFile(filename, obj, function () {
                // run init script
                execFile('../interpreter/wasm', ["-m", "-init", "0", filename], (error, stdout, stderr) => {
                    if (error) {
                        console.error('stderr', stderr)
                        return
                    }
                    console.log('stdout', stdout)
                    // It should give the initial state hash, post it to contract
                    contract.methods.add(JSON.parse(stdout), res[0].hash).send(send_opt).then(function (tr) {
                        console.log("Success", tr)
                    })
                })
            })
        })
    })
})


setTimeout(() => {
    console.log(web3.currentProvider);
    contract.events.Posted({fromBlock:0}, function (err, log) { console.log(err) }).on("data", function () {
        console.log("here")
    }).on('error', console.error)
}, 1000)

// We should listen to contract events

http.listen(22448, function(){
    console.log("listening on *:22448")
})

