
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.WebsocketProvider('ws://' + host + ':8546'))

var dir = "../contracts/compiled/"

var send_opt

async function createContract(name, args) {
    var code = "0x" + fs.readFileSync(dir + name + ".bin")
    var abi = JSON.parse(fs.readFileSync(dir + name + ".abi"))
    return new web3.eth.Contract(abi).deploy({data: code, arguments:args}).send(send_opt)
}

async function doDeploy() {
    var accts = await web3.eth.getAccounts()
    send_opt = {gas:4700000, from:accts[0]}
    var judge = await createContract("Judge")
    var fs = await createContract("Filesystem")
    var iactive = await createContract("Interactive2", [judge.options.address])
    var tasks = await createContract("Tasks", [iactive.options.address, fs.options.address])
    var merkle = await createContract("Merkle")
    iactive.setProvider(web3.currentProvider)
    var tx = await iactive.methods.registerJudge(1, merkle.options.address).send(send_opt)
    // console.log(tx)
    var config = {
        judge: judge.options.address,
        interactive: iactive.options.address,
        host: host,
        base: send_opt.from,
        tasks: tasks.options.address,
        fs: fs.options.address,
        merkle: merkle.options.address,
        // events_disabled: true, poll: true,
        events_disabled: false, poll: false,
        timeout: 5000,
        tick: true,
    }
    console.log(JSON.stringify(config))
    process.exit(0)
}

doDeploy()

