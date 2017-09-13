
var Web3 = require('web3')
var web3 = new Web3()
var fs = require("fs")

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'))

var base = "0xb29e66c60114e5ddc9a60e61e38e6b60a7448c25"

web3.eth.personal.getAccounts().then(function (c) {
    console.log(c);
});

web3.eth.getBalance(base).then(balance => console.log(balance));

var code = fs.readFileSync("contracts/Instruction.bin")
var abi = JSON.parse(fs.readFileSync("contracts/Instruction.abi"))
var test = JSON.parse(fs.readFileSync("load.json"))

// console.log(test.states)

var send_opt = {from:base, gas: 4000000}

var sol_testContract = new web3.eth.Contract(abi)

function checkFetch(c) {
    var vm = test.fetch.vm
    c.methods.select(0).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
    // c.methods.hashVM().call().then(b => console.log(b.toString(16)))
    c.methods.proveFetch(test.fetch.location).call().then(b => console.log("Fetch: " + b))
}

function checkInit(c) {
    var vm = test.init.vm
    c.methods.select(1).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
    // c.methods.hashVM().call().then(b => console.log(b.toString(16)))
    c.methods.proveInit(test.init.op).call().then(b => console.log("Init: " + b))
}

function checkRead1(c) {
    var vm = test.reg1.vm
    var m = test.reg1.machine
    c.methods.select(2).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
    c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error)
    c.methods.proveRead1(test.reg1.merkle.list, test.reg1.merkle.location).call().then(b => console.log("R1: " + b))
}

function checkRead2(c) {
    var vm = test.reg2.vm
    var m = test.reg2.machine
    c.methods.select(3).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
    c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error)
    c.methods.proveRead2(test.reg2.merkle.list, test.reg2.merkle.location).call().then(b => console.log("R2: " + b.toString(16)))
}

function checkRead3(c) {
    var vm = test.reg3.vm
    var m = test.reg3.machine
    c.methods.select(4).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
    c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error)
    c.methods.proveRead3(test.reg3.merkle.list, test.reg3.merkle.location).call().then(b => console.log("R3: " + b))
}

function checkALU(c) {
    var m = test.alu
    c.methods.select(5).send(send_opt).on("error", console.error)
    c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(function () {
        c.methods.proveALU().call().then(b => console.log("ALU: " + b))
    })
}

function checkWrite1(c) {
    var vm = test.write1.vm
    var m = test.write1.machine
    c.methods.select(6).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
      .then(() => {
         c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(() =>
            c.methods.proveWrite1(test.write1.merkle.list, test.write1.merkle.location).call().then(b => console.log("W1: " + b.toString(16))))
                                                                                                                         })
}

function checkWrite2(c) {
    var vm = test.write2.vm
    var m = test.write2.machine
    c.methods.select(7).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
      .then(() => {
         c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(() =>
            c.methods.proveWrite2(test.write2.merkle.list, test.write2.merkle.location).call().then(b => console.log("W2: " + b)))
                                                                                                                         })
}

function checkPC(c) {
    var vm = test.pc.vm
    var m = test.pc.machine
    c.methods.select(8).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
      .then(() => {
         c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(() =>
            c.methods.proveUpdatePC().call().then(b => console.log("PC: " + b)))
                                                                                                                         })
}

function checkBreakPtr(c) {
    var vm = test.break_ptr.vm
    var m = test.break_ptr.machine
    c.methods.select(9).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
      .then(() => {
         c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(() =>
            c.methods.proveUpdateBreakPtr().call().then(b => console.log("Break PTR: " + b)))
                                                                                                                         })
}

function checkStackPtr(c) {
    var vm = test.stack_ptr.vm
    var m = test.stack_ptr.machine
    c.methods.select(10).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
      .then(() => {
         c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(() =>
            c.methods.proveUpdateStackPtr().call().then(b => console.log("Stack PTR: " + b)))
                                                                                                                         })
}

function checkCallPtr(c) {
    var vm = test.call_ptr.vm
    var m = test.call_ptr.machine
    c.methods.select(11).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
      .then(() => {
         c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(() =>
            c.methods.proveUpdateCallPtr().call().then(b => console.log("Call PTR: " + b)))
                                                                                                                         })
}

function checkMemsize(c) {
    var vm = test.memsize.vm
    var m = test.memsize.machine
    c.methods.select(12).send(send_opt).on("error", console.error)
    c.methods.setVM(vm.code, vm.stack, vm.memory, vm.break_stack1, vm.break_stack2, vm.globals, vm.call_stack, vm.calltable,
            vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize).send(send_opt).on("error", console.error)
      .then(() => {
         c.methods.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg).send(send_opt).on("error", console.error).then(() =>
            c.methods.proveUpdateMemsize().call().then(b => console.log("Final: " + b)))
                                                                                                                         })
}

function doTest(tst) {
    sol_testContract.deploy({data:code, arguments:[test.states, base, base]}).send(send_opt).then(contract => {
        console.log('Contract mined! address: ' + contract.options.address)
        tst(contract)
    })
}


// doTest(checkFetch)
// doTest(checkInit)
// doTest(checkRead3)
doTest(checkALU) 
// doTest(checkWrite2)
// doTest(checkCallPtr)
// doTest(checkMemsize)


