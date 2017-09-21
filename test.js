
var Web3 = require('web3')
var web3 = new Web3()
var fs = require("fs")

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'))

var base = web3.eth.coinbase
// var base = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1"
// var base = "0x9acbcf2d9bd157999ae5541c446f8d6962da1d4d"


web3.eth.getBalance(base, (err,balance) => {
    if (err) console.log(err)
    else console.log(balance.toString())
})

if (process.argv.length < 3) {
    console.log("Give test file as argument!")
    process.exit(0)
}

var code = fs.readFileSync("contracts/Instruction.bin")
var abi = JSON.parse(fs.readFileSync("contracts/Instruction.abi"))
var test = JSON.parse(fs.readFileSync(process.argv[2]))

// console.log(test.states)

var send_opt = {from:base, gas: 4000000}

var phase_table = {
    0: "fetch",
    1: "init",
    2: "reg1",
    3: "reg2",
    4: "reg3",
    5: "alu",
    6: "write1",
    7: "write2",
    8: "pc",
    9: "break_ptr",
    10: "stack_ptr",
    11: "call_ptr",
    12: "memsize",
}

function handleResult(phase, err, res) {
        if (err) {
            console.log("Phase", phase, err)
            process.exit(-1)
        }
        else console.log(res)
}

function testPhase(contr, phase) {
    var proof = test[phase_table[phase]]
    var merkle = (proof.merkle && proof.merkle.list) || proof.location || []
    var loc = (proof.merkle && proof.merkle.location) || 0
    var fetched = proof.op || 0
    var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
    if (phase == 5) m = proof
    var vm = proof.vm || { code: "0x00", stack:"0x00", break_stack1:"0x00", break_stack2:"0x00", call_stack:"0x00", calltable:"0x00",
                          globals : "0x00", memory:"0x00", calltypes:"0x00", input:"0x00",
                          pc:0, stack_ptr:0, break_ptr:0, call_ptr:0, memsize:0}
    contr.judge.call(test.states, phase, merkle, loc, fetched, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                     [vm.code, vm.stack, vm.memory, vm.call_stack, vm.break_stack1, vm.break_stack2, vm.globals, vm.calltable, vm.calltypes, vm.input],
                     [vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize], send_opt, (err,res) => handleResult(phase,err,res))
}

function doTest() {
    web3.eth.contract(abi).new({from: base, data: '0x' + code, gas: '4500000'}, function (e, contr) {
        if (e) {
            console.log(e)
            process.exit(-1)
        }
        if (contr && typeof contr.address !== 'undefined') {
            console.log('Contract mined! address: ' + contr.address)
            for (var i = 0; i < 13; i++) testPhase(contr, i)
        }
    })
}

doTest()

