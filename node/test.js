
var Web3 = require('web3')
var web3 = new Web3()
var fs = require("fs")

var provider = new web3.providers.HttpProvider('http://localhost:8545')
web3.setProvider(provider)

if (process.argv.length < 3) {
    console.log("Give test file as argument!")
    process.exit(0)
}

var code = fs.readFileSync("../contracts/compiled/Judge.bin")
var abi = JSON.parse(fs.readFileSync("../contracts/compiled/Judge.abi"))
var test = JSON.parse(fs.readFileSync(process.argv[2]))

// console.log(test.states)

// var send_opt = {from:base, gas: 4000000}

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
    9: "stack_ptr",
    10: "call_ptr",
    11: "memsize",
}

function handleResult(phase, err, res) {
        if (err) {
            console.log("Phase", phase, err)
            // process.exit(-1)
        }
        else console.log(res)
}

function hex32(str) {
    var res = str.substr(2)
    while (res.length < 64) res = "0"+res
    return "0x"+res
}

function testPhase(contr, phase, send_opt) {
    var proof = test[phase_table[phase]]
    var merkle = proof.location || []
    var merkle2 = []
    if (proof.merkle) {
        merkle = proof.merkle.list || proof.merkle.list1 || []
        merkle2 = proof.merkle.list2 || []
    }
    merkle = merkle.map(hex32)
    merkle2 = merkle2.map(hex32)
    // console.log(merkle, merkle2)
    // var merkle = (proof.merkle && proof.merkle.list) || proof.location || []
    // var loc = (proof.merkle && proof.merkle.location) || 0
    var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
    if (phase == 5 || phase == 1) m = proof
    var vm 
    if (typeof proof.vm != "object") vm = { code: "0x00", stack:"0x00", call_stack:"0x00", calltable:"0x00",
                                           globals : "0x00", memory:"0x00", calltypes:"0x00", input_size:"0x00", input_name:"0x00", input_data:"0x00",
                                           pc:0, stack_ptr:0, call_ptr:0, memsize:0}
    else vm = proof.vm
    // console.log(typeof proof.vm)
    var regs = [m.reg1, m.reg2, m.reg3, m.ireg]
    var roots = [vm.code, vm.stack, vm.memory, vm.call_stack, vm.globals, vm.calltable, vm.calltypes, vm.input_size, vm.input_name, vm.input_data]
    var pointers = [vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize]
    //contr.methods.debug_judge(test.states, phase, merkle, merkle2, m.vm, m.op, regs, roots, pointers).call(send_opt, (err,res) => handleResult(phase,err,res))
    contr.methods.judge(test.states, phase, merkle, merkle2, m.vm, m.op, regs, roots, pointers).call(send_opt, (err,res) => handleResult(phase,err,res))
    /* contr.methods.judge(test.states, phase, merkle, merkle2, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                     [vm.code, vm.stack, vm.memory, vm.call_stack, vm.globals, vm.calltable, vm.calltypes,
                      vm.input_size, vm.input_name, vm.input_data],
                     [vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize]).send(send_opt) */
}

async function doTest() {
    var accts = await web3.eth.getAccounts()
    var base = accts[0]
    var contr = new web3.eth.Contract(abi)
    var send_opt = {from: base, gas: '4500000'}
    var contr = await contr.deploy({data: '0x' + code}).send(send_opt)
    contr.setProvider(provider)
    console.log('Contract mined! address: ' + contr.options.address)
    for (var i = 0; i < 12; i++) testPhase(contr, i, send_opt)
}

doTest()

