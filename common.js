
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

// perhaps have more stuff in config

var CodeType = {
    WAST: 0,
    WASM: 1,
}

exports.CodeType = CodeType

function getExtension(t) {
    if (t == CodeType.WASM) return "wasm"
    else return "wast"
}

exports.getExtension = getExtension

function buildArgs(args, config) {
    if (config.actor.error) {
        args.push("-insert-error")
        args.push("" + config.actor.error_location)
    }
    args.push("-file")
    args.push("" + config.input_file)
    if (config.code_type == CodeType.WAST) ["-case", "0", config.code_file].forEach(a => args.push(a))
    else ["-wasm", config.code_file].forEach(a => args.push(a))
    return args
}

function initTask(config, task, inp, cont) {
    fs.writeFile(config.code_file, task, 'binary', function () {
        fs.writeFile(config.input_file, inp, 'binary', function () {
            // run init script
            execFile(wasm_path, buildArgs(["-m", "-init"], config), (error, stdout, stderr) => {
                if (error) {
                    logger.error('initialization error %s', stderr)
                    return
                }
                logger.info('initializing task %s', stdout)
                cont(JSON.parse(stdout).vm.code)
            })
        })
    })
}

exports.initTask = initTask

function ensureInputFile(config, cont) {
    var args = buildArgs(["-m", "-input-proof", config.input_file], config)
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

function ensureOutputFile(config, cont) {
    var args = buildArgs(["-m", "-output-proof", "blockchain"], config)
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

function taskResult(config, cont) {
    if (config.actor.stop_early < 0) {
        var args = buildArgs(["-m", "-result"], config)
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
        var args = buildArgs(["-m", "-location", config.actor.stop_early.toString()], config)
        execFile(wasm_path, args, function (error, stdout, stderr) {
            if (error) {
                logger.error('stderr %s', stderr)
                return
            }
            logger.info('exited early %s', stdout)
            cont({steps: config.actor.stop_early, result:JSON.parse(stdout)})
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
                cont(Buffer.concat(chunks).toString("binary"))
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

function getAndEnsureInputFile(config, filehash, filenum, wast_contents, id, cont) {
    logger.info("Getting input file %s %s", filehash, filenum.toString(16))
    if (filenum == "0") getFile(filehash, a => cont({data:a, name:filehash}))
    else appFile.getFile(contract, filenum, function (obj) {
        initTask(config, wast_contents, obj.data, function () {
            ensureInputFile(config, function (proof) {
                logger.info("ensuring file", {id:id, proof: proof})
                /*
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

function getLocation(place, config, cont) {
    var args = buildArgs(["-m", "-location", place], config)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr %s', stderr)
        else {
            logger.info("Got location " + place + ": " + stdout)
            cont(JSON.parse(stdout))
        }
    })
}

exports.getLocation = getLocation

function getStep(place, config, cont) {
    var args = buildArgs(["-m", "-step", place], config)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getStep = getStep

function getErrorStep(place, config, cont) {
    var args = insertError(["-m", "-error-step", place], config)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getErrorStep = getErrorStep

function getFinality(place, config, cont) {
    var args = insertError(["-m", "-final", place], config)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getFinality = getFinality

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

