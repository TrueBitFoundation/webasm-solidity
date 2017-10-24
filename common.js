
var fs = require("fs")
var winston = require("winston")
var Web3 = require('web3')
var web3 = new Web3()
var execFile = require('child_process').execFile
var ipfsAPI = require('ipfs-api')

var appFile = require("./appFileBytes")

var addresses = JSON.parse(fs.readFileSync("config.json"))

var host = addresses.host || "localhost"

var dir = process.argv[2] ? process.cwd() + "/" + process.argv[2] : process.cwd()

// console.log(dir)

var format = winston.format

const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.splat(),
    format.simple()
  ),
  // format: winston.format.simple(),
  transports: [
    new winston.transports.File({ filename: dir+'/error.log', level: 'error' }),
    new winston.transports.File({ filename: dir+'/combined.log' })
  ]
})

// connect to ipfs daemon API server
var ipfs = ipfsAPI(host, '5001', {protocol: 'http'})

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var solver_error = true
var verifier_error = false

// var base = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1"
var base = addresses.base

logger.info("Using address %s", base)

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

logger.info('using offchain interpreter at %s', wasm_path)

// var wasm_path = "ocaml-offchain/interpreter/wasm"
// var wasm_path = "../webasm/interpreter/wasm"

// change current directory here?
if (process.argv[2]) process.chdir(process.argv[2])

function initTask(fname, task, ifname, inp, cont) {
    fs.writeFile(fname, task, function () {
        fs.writeFile(ifname, inp, function () {
            // run init script
            execFile(wasm_path, ["-m", "-init", "-file", ifname, "-case", "0", fname], (error, stdout, stderr) => {
                if (error) {
                    logger.error('initialization error %s')
                    return
                }
                logger.info('initializing task %s', stdout)
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
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) {
            logger.error('stderr %s', stderr)
            return
        }
        logger.info('input file proof %s', stdout)
        if (stdout) cont(JSON.parse(stdout))
    })
}

exports.ensureInputFile = ensureInputFile

function ensureOutputFile(filename, ifilename, actor, cont) {
    var args = insertError(["-m", "-file", ifilename, "-output-proof", "blockchain", "-case", "0", filename], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) {
            logger.error('stderr %s', stderr)
            return
        }
        logger.info('output file proof %s', stdout)
        cont(JSON.parse(stdout))
    })
}

exports.ensureOutputFile = ensureOutputFile

function taskResult(filename, ifilename, actor, cont) {
    if (actor.stop_early < 0) {
        var args = insertError(["-m", "-result", "-file", ifilename, "-case", "0", filename], actor)
        execFile(wasm_path, args, function (error, stdout, stderr) {
            if (error) {
                logger.error('stderr %s', stderr)
                return
            }
            logger.info('solved task %s', stdout)
            cont(JSON.parse(stdout))
        })
    }
    else {
        var args = insertError(["-m", "-step", actor.stop_early.toString(), "-file", ifilename, "-case", "0", filename], actor)
        execFile(wasm_path, args, function (error, stdout, stderr) {
            if (error) {
                logger.error('stderr %s', stderr)
                return
            }
            logger.info('exited early %s', stdout)
            cont({steps: actor.stop_early, result:JSON.parse(stdout)})
        })
    }
}

exports.taskResult = taskResult

function getFile(fileid, cont) {
    logger.info("getting file %s", fileid)
    ipfs.get(fileid, function (err, stream) {
        if (err) {
            logger.error("IPFS error", err)
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
    logger.info("Getting input file %s %s", filehash, filenum.toString(16))
    if (filenum == "0") getFile(filehash, a => cont({data:a, name:filehash}))
    else appFile.getFile(contract, filenum, cont)
}

exports.getInputFile = getInputFile

function getAndEnsureInputFile(filehash, filenum, wast_file, wast_contents, id, cont) {
    logger.info("Getting input file %s %s", filehash, filenum.toString(16))
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
                    logger.info("Called ensure input", err, tx)
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
        if (error) console.error('stderr %s', stderr)
        else {
            logger.info("Got location " + place + ": " + stdout)
            cont(JSON.parse(stdout))
        }
    })
}

exports.getLocation = getLocation

function getStep(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-step", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getStep = getStep

function getErrorStep(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-error-step", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getErrorStep = getErrorStep

function getFinality(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-final", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
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

exports.getRoots = getRoots

function getPointers(vm) {
    return [vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize]
}

exports.getPointers = getPointers

exports.appFile = appFile
exports.ipfs = ipfs
exports.send_opt = send_opt
exports.contract = contract
exports.iactive = iactive
exports.base = base

exports.logger = logger

