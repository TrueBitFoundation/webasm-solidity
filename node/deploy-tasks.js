
/***

var Web3 = require('./index')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))
web3.eth.getStorageProof("0x32bce268bc5444dfe211e90b344c4d0360ce8977b6eb133d227f536656e61f61", "0x6d023D3c72c21b997AbeCF03A8bb28fce654A426", "0x2345")

****/

var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var host = process.argv[2] || "localhost"

web3.setProvider(new web3.providers.WebsocketProvider('ws://' + host + ':8546'))
// web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

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
    var iactive = await createContract("Interactive", [judge.options.address])
    var tasks = await createContract("Tasks", [iactive.options.address, fs.options.address])
    var resubmit = await createContract("TasksResubmit", [iactive.options.address, fs.options.address])
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
        resubmit: resubmit.options.address,
        fs: fs.options.address,
        merkle: merkle.options.address,
        // events_disabled: true, poll: true,
        events_disabled: false, poll: false,
        timeout: 5000,
        tick: true,
        interpreter_args: [],
    }
    console.log(JSON.stringify(config))
    process.exit(0)
}

doDeploy()

