
var Web3 = require('web3')
var web3 = new Web3()
var fs = require("fs")

if (process.argv.length < 3) {
    console.log("Give test file as argument!")
    process.exit(0)
}

var host = process.argv[3] || "localhost"

var steps = parseInt(process.argv[4]) || 1000

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var base = web3.eth.coinbase
// var base = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1"
// var base = "0x9acbcf2d9bd157999ae5541c446f8d6962da1d4d"


web3.eth.getBalance(base, (err,balance) => {
    if (err) console.log(err)
    else console.log(balance.toString())
})

var code = fs.readFileSync("contracts/Interpreter.bin")
var abi = JSON.parse(fs.readFileSync("contracts/Interpreter.abi"))
var test = JSON.parse(fs.readFileSync(process.argv[2]))

var send_opt = {from:base, gas: 40000000000}

function handleResult(err, res) {
        if (err) {
            console.log("Got error", err)
            process.exit(-1)
        }
        else console.log(res)
        if (res[0].toString() != "7034535277573963776") {
            console.log("wrong result")
            process.exit(-1)
        }
}

function testInterpreter(contr) {
    vm = test
    /*vm.memory = []
    vm.stack = []
    vm.call_stack = []
    vm.globals = []
    vm.calltable = []
    vm.calltypes = []
    vm.input = [] */
    contr.run2.call(steps*12, vm.code, [vm.stack.length, vm.memory.length, vm.call_stack.length,
                    vm.globals.length, vm.calltable.length, vm.calltypes.length, vm.input.length],
                    vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize, send_opt, (err,res) => handleResult(err,res))
    /* contr.run.call(vm.code, vm.stack, vm.memory, vm.call_stack, vm.globals, vm.calltable, vm.calltypes, vm.input,
                   vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize, send_opt, (err,res) => handleResult(err,res)) */
}

function doTest() {
    web3.eth.contract(abi).new({from: base, data: '0x' + code, gas: '4500000'}, function (e, contr) {
        if (e) {
            console.log(e)
            process.exit(-1)
        }
        if (contr && typeof contr.address !== 'undefined') {
            console.log('Contract mined! address: ' + contr.address)
            testInterpreter(contr)
        }
    })
}

doTest()

