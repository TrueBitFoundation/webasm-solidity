
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.WebsocketProvider('http://' + host + ':8546'))

var code = "0x" + fs.readFileSync("contracts/Tasks.bin")
var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var code2 = "0x" + fs.readFileSync("contracts/Interactive2.bin")
var abi2 = JSON.parse(fs.readFileSync("contracts/Interactive2.abi"))

var code3 = "0x" + fs.readFileSync("contracts/Judge.bin")
var abi3 = JSON.parse(fs.readFileSync("contracts/Judge.abi"))

var code4 = "0x" + fs.readFileSync("contracts/GetCode.bin")
var abi4 = JSON.parse(fs.readFileSync("contracts/GetCode.abi"))

async function doDeploy() {
    var accts = await web3.eth.getAccounts()
    var send_opt = {gas:5000000, from:accts[0]}
    var judge = await new web3.eth.Contract(abi3).deploy({data: code3}).send(send_opt)
    var iactive = await new web3.eth.Contract(abi2).deploy({data: code2, arguments:[judge.options.address]}).send(send_opt)
    var tasks = await new web3.eth.Contract(abi).deploy({data: code, arguments:[iactive.options.address]}).send(send_opt)
    var get_code = await new web3.eth.Contract(abi4).deploy({data: code4}).send(send_opt)
    var config = {
        judge: judge.options.address,
        interactive: iactive.options.address,
        host: host,
/*        base: web3.eth.Iban.toAddress(web3.eth.Iban.fromEthereumAddress(send_opt.from)), */
        base: send_opt.from,
        tasks: tasks.options.address,
        get_code: get_code.options.address,
    }
    console.log(JSON.stringify(config))
    process.exit(0)
}

doDeploy()


