
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

var config = JSON.parse(fs.readFileSync("config.json"))

web3.setProvider(new web3.providers.WebsocketProvider('ws://' + config.host + ':8546'))

var send_opt = {from:config.base, gas: 4000000, gasPrice:"21000000000"}
var contract = new web3.eth.Contract(JSON.parse(fs.readFileSync("../contracts/compiled/Tasks.abi")), config.tasks)

var addr = process.argv[2]
var amount = web3.utils.toWei(process.argv[3], "ether")

async function main() {
    var deposit = await contract.methods.getDeposit(config.base).call()
    console.log("Hash deposit", deposit, "withdrawing")
    var tx = await contract.methods.withdrawDeposit(deposit).send(send_opt)
    console.log("Sending", amount, "to", addr)
    send_opt.value = amount
    await web3.eth.sendTransaction(send_opt)
    process.exit(0)
}

main()

