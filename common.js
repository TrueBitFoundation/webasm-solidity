
var fs = require("fs")
var http = require('http').createServer()
var io = require("socket.io")(http)
var Web3 = require('web3')
var web3 = new Web3()
var execFile = require('child_process').execFile
var ipfsAPI = require('ipfs-api')

var appFile = require("./appFileBytes")

var addresses = JSON.parse(fs.readFileSync("config.json"))

var host = addresses.host || "localhost"

// connect to ipfs daemon API server
var ipfs = ipfsAPI(host, '5001', {protocol: 'http'})

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var solver_error = true
var verifier_error = false

console.log(web3.eth.coinbase)

// var base = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1"
var base = web3.eth.coinbase

var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var send_opt = {from:base, gas: 4000000}

var contractABI = web3.eth.contract(abi)
var contract = contractABI.at(addresses.tasks)

var iactiveABI = web3.eth.contract(JSON.parse(fs.readFileSync("contracts/Interactive2.abi")))
var iactive = iactiveABI.at(addresses.interactive)

var judgeABI = web3.eth.contract(JSON.parse(fs.readFileSync("contracts/Judge.abi")))
var judge = judgeABI.at(addresses.judge)

appFile.configure(web3)

var wasm_path = process.cwd() + "/ocaml-offchain/interpreter/wasm"

// var wasm_path = "ocaml-offchain/interpreter/wasm"
// var wasm_path = "../webasm/interpreter/wasm"

// change current directory here?
if (process.argv[2]) process.chdir(process.argv[2])

function initTask(fname, task, ifname, inp, cont) {
    fs.writeFile(fname, task, function () {
        fs.writeFile(ifname, inp, function () {
            // run init script
                console.log('checking executable', wasm_path)
            execFile(wasm_path, ["-m", "-init", "-file", ifname, "-case", "0", fname], (error, stdout, stderr) => {
                if (error) {
                    console.error('initialization error', stderr)
                    return
                }
                console.log('initializing task', stdout)
                cont(JSON.parse(stdout).vm.code)
            })
        })
    })
}

exports.initTask = initTask

// perhaps load this from config
var actor = { error: false, error_location: 0 }

function insertError(args, actor) {
    if (actor.error) {
        args.push("-insert-error")
        args.push("" + actor.error_location)
    }
    return args
}

function ensureInputFile(filename, ifilename, actor, cont) {
    var args = insertError(["-m", "-file", ifilename, "-input-proof", ifilename, "-case", "0", filename], actor)
    console.log("ensure args", args)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) {
            console.error('stderr', stderr)
            return
        }
        console.log('input file proof', stdout)
        if (stdout) cont(JSON.parse(stdout))
    })
}

exports.ensureInputFile = ensureInputFile

function ensureOutputFile(filename, ifilename, actor, cont) {
    var args = insertError(["-m", "-file", ifilename, "-output-proof", "blockchain", "-case", "0", filename], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) {
            console.error('stderr', stderr)
            return
        }
        console.log('output file proof', stdout)
        cont(JSON.parse(stdout))
    })
}

exports.ensureOutputFile = ensureOutputFile

function taskResult(filename, ifilename, actor, cont) {
    var args = insertError(["-m", "-result", "-file", ifilename, "-case", "0", filename], actor)
    console.log("task args", args)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) {
            console.error('stderr', stderr)
            return
        }
        console.log('solved task', stdout)
        cont(JSON.parse(stdout))
    })
}

exports.taskResult = taskResult

function getFile(fileid, cont) {
    console.log("gettting file ", fileid)
    ipfs.get(fileid, function (err, stream) {
        if (err) {
            console.log(err)
            process.exit(1)
            return
        }
        var chunks = []
        stream.on('data', (file) => {
            file.content.on("data", function (chunk) {
                chunks.push(chunk);
            })
            file.content.on("end", function () {
                cont(Buffer.concat(chunks).toString())
            })
        })
    })
}

exports.getFile = getFile

function getInputFile(filehash, filenum, cont) {
    console.log("Getting input file ", filehash, filenum.toString(16))
    if (filenum == "0") getFile(filehash, a => cont({data:a, name:filehash}))
    else appFile.getFile(contract, filenum, cont)
}

exports.getInputFile = getInputFile

function getAndEnsureInputFile(filehash, filenum, wast_file, wast_contents, id, cont) {
    console.log("Getting input file ", filehash, filenum.toString(16))
    if (filenum == "0") getFile(filehash, a => cont({data:a, name:filehash}))
    else appFile.getFile(contract, filenum, function (obj) {
        initTask("task.wast", wast_contents, "input.bin", obj.data, function () {
            ensureInputFile("task.wast", "input.bin", verifier, function (proof) {
                /*
                console.log("ensuring", id, proof.hash, getRoots(proof.vm), getPointers(proof.vm))
                judge.calcStateHash.call(getRoots(proof.vm), getPointers(proof.vm), function (err,res) {
                    console.log("calculated hash", err, res)
                })*/
                contract.ensureInputFile(id, proof.hash, getRoots(proof.vm), getPointers(proof.vm), proof.loc.list, proof.loc.location, send_opt, function (err,tx) {
                    console.log("ensure input", err, tx)
                })
            })
            cont(obj)
        })
    })
}

exports.getAndEnsureInputFile = getAndEnsureInputFile

function getLocation(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-location", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else {
            console.log("Got location " + place + ": " + stdout)
            cont(JSON.parse(stdout))
        }
    })
}

exports.getLocation = getLocation

function getStep(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-step", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getStep = getStep

function getErrorStep(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-error-step", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getErrorStep = getErrorStep

function getFinality(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-final", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.phase_table = {
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

function getRoots(vm) {
    return [vm.code, vm.stack, vm.memory, vm.call_stack, vm.globals, vm.calltable, vm.calltypes,
                            vm.input_size, vm.input_name, vm.input_data]
}

function getPointers(vm) {
    return [vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize]
}

exports.getRoots = getRoots
exports.getPointers = getPointers

exports.appFile = appFile
exports.ipfs = ipfs
exports.send_opt = send_opt
exports.contract = contract
exports.iactive = iactive
exports.base = base

