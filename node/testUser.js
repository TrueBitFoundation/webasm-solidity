

var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.WebsocketProvider('http://' + host + ':8546'))

var code = fs.readFileSync("../contracts/compiled/TestUser.bin")
var abi = JSON.parse(fs.readFileSync("../contracts/compiled/TestUser.abi"))

var addresses = JSON.parse(fs.readFileSync("config.json"))

async function doDeploy() {
    var accts = await web3.eth.getAccounts()
    var send_opt = {gas:4000000, from:accts[0]}
    
    var args = [addresses.tasks, "0xd1BA7647fC50548BdF1F48198C2Cf35eBBBee248", "0xab70b7c98d9a629c6b3bf672463dd2a031dd194da2ba752e1e2d5af6422241ba"]
    
    /*
    var tasks = new web3.eth.Contract(JSON.parse(fs.readFileSync("../contracts/compiled/Tasks.abi")), addresses.tasks)
    */
    
    var contract = await new web3.eth.Contract(abi).deploy({data: "0x" + code, arguments:args}).send(send_opt)
    console.log("made contract " + contract.options.address)
    var hash = await contract.methods.hashName("test.data").call(send_opt)
    
    console.log("hashed name: " + hash)
    var res = await contract.methods.debugStuff().call(send_opt)
    console.log(res)
    // console.log(res[0].toString(16), res[1].toString(16), res)
    var tx = await contract.methods.doStuff().send(send_opt)
    console.log("working", tx)
    contract.events.Success("latest", function (err,res) {
        console.log(res)
        process.exit(0)
    })
}

doDeploy()

