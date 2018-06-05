
var fs = require("fs")
var winston = require("winston")
var Web3 = require('web3')
var web3 = new Web3()
var execFile = require('child_process').execFile
var ipfsAPI = require('ipfs-api')

var addresses = JSON.parse(fs.readFileSync("config.json"))

var wasm_path = addresses.wasm || process.cwd() + "/../../ocaml-offchain/interpreter/wasm"

var host = addresses.host || "localhost"
var ipfshost = addresses.ipfshost || host

var base = addresses.base

if (addresses.ipc) {
    var net = require("net")
    web3.setProvider(new web3.providers.IpcProvider(addresses.ipc, net))
    ipfshost = addresses.ipfshost || "localhost"
}
else web3.setProvider(new web3.providers.WebsocketProvider('http://' + host + ':8546'))

var contract_dir = addresses.contract_dir || "../contracts/compiled/"

var send_opt = {from:base, gas: 4000000, gasPrice:addresses.gasPrice || "21000000000"}
var contract = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "Tasks.abi")), addresses.tasks)
var iactive = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "Interactive.abi")), addresses.interactive)
var judge = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "Judge.abi")), addresses.judge)
var filesystem = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "Filesystem.abi")), addresses.fs)
var get_code = new web3.eth.Contract(JSON.parse(fs.readFileSync(contract_dir + "GetCode.abi")), addresses.get_code)

// connect to ipfs daemon API server
var ipfs = ipfsAPI(ipfshost, '5001', {protocol: 'http'})

const mongoose = require('mongoose')
mongoose.connect('mongodb://localhost/truebit')

const File = mongoose.model('File', { root: String, data: String })

exports.make = function (dir) {

var exports = {}

// var dir = process.argv[2] ? process.cwd() + "/" + process.argv[2] : process.cwd()

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

logger.info("Using address %s", base)

exports.log_file = dir+'/combined.log'

// appFile.configure(web3, base)

logger.info('using offchain interpreter at %s', wasm_path)

// var wasm_path = "ocaml-offchain/interpreter/wasm"
// var wasm_path = "../webasm/interpreter/wasm"

// change current directory here?
// if (process.argv[2]) process.chdir(process.argv[2])

// perhaps have more stuff in config

var CodeType = {
    WAST: 0,
    WASM: 1,
    INTERNAL: 2,
    INPUT : 3,
}

var Storage = {
    IPFS: 0,
    BLOCKCHAIN: 1,
}

exports.CodeType = CodeType
exports.Storage = Storage

var extensions = {
    0: "wast",
    1: "wasm",
    2: "wasm",
    3: "bin"
}

function getExtension(t) {
    return extensions[t]
}

exports.getExtension = getExtension

function buildArgs(args, config) {
    if (config.actor.error) {
        args.push("-insert-error")
        args.push("" + config.actor.error_location)
    }
    if (config.vm_parameters) {
        args.push("-memory-size")
        args.push(config.vm_parameters.mem)
        args.push("-stack-size")
        args.push(config.vm_parameters.stack)
        args.push("-table-size")
        args.push(config.vm_parameters.table)
        args.push("-globals-size")
        args.push(config.vm_parameters.globals)
        args.push("-call-stack-size")
        args.push(config.vm_parameters.call)
    }
    for (i in config.files) {
        args.push("-file")
        args.push("" + config.files[config.files.length - i - 1])
    }
    if (config.code_type == CodeType.WAST) ["-case", "0", config.code_file].forEach(a => args.push(a))
    else ["-wasm", config.code_file].forEach(a => args.push(a))
    logger.info("Built args", {args:args, cmd:wasm_path + " " + args.join(" ")})
    if (addresses.interpreter_args) return args.concat(addresses.interpreter_args)
    else return args
}

function exec(config, lst) {
    var args = buildArgs(lst, config)
    return new Promise(function (cont,err) {
        execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
            if (stderr) logger.error('error %s', stderr, args)
            if (stdout) logger.info('output %s', stdout, args)
            if (error) err(error)
            else cont(stdout)
        })
    })
}
    
exports.exec = exec

function writeFiles(files) {
    var n = 0
    return new Promise(function (cont,err) {
        var addFile = function (e) {
            fs.writeFile(dir + "/" + e.name, e.content, "binary", function () {
                n++;
                logger.info("wrote file %s", e.name)
                if (n == files.length) cont()
            })
        }
        if (files.length == 0) cont()
        else files.forEach(addFile)
    })
}

async function initTask(config) {
    var stdout = await exec(config, ["-m", "-input"])
    return JSON.parse(stdout).hash
}

exports.initTask = initTask

function ensureInputFile(config, cont) {
    var args = buildArgs(["-m", "-input-proof", config.input_file], config)
    execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
        if (error) return logger.error('stderr %s', stderr)
        logger.info('input file proof %s', stdout)
        if (stdout) cont(JSON.parse(stdout))
    })
}

exports.ensureInputFile = ensureInputFile

function ensureOutputFile(config, cont) {
    var args = buildArgs(["-m", "-output-proof", "blockchain"], config)
    execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
        if (error) return logger.error('stderr %s', stderr)
        logger.info('output file proof %s', stdout)
        cont(JSON.parse(stdout))
    })
}

exports.ensureOutputFile = ensureOutputFile

function taskResult(config, cont) {
    if (config.actor.stop_early < 0 && !config.actor.error && config.code_type != CodeType.WAST) {
        execFile("node", ["../env.js"].concat(config.files), {cwd:dir}, function (error, stdout, stderr) {
            logger.info("solving with JIT", {stdout:stdout, stderr:stderr, dir:dir})
            var args = buildArgs(["-m", "-input", "-input2"], config)
            execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
                if (error) return logger.error('stderr %s', stderr)
                logger.info('solved task %s', stdout)
                cont(JSON.parse(stdout))
            })
        })
    }
    else taskResultVM(config, cont)
}

exports.taskResult = taskResult

exports.insertMetering = function (fname) {
     var dta = fs.readFileSync(dir + "/" + fname)
     const metering = require('wasm-metering')
     const meteredWasm = metering.meterWASM(dta, {
            moduleStr: "env",
            fieldStr: "usegas",
            meterType: 'i64',
     })
     fs.writeFileSync(dir + "/" + fname, meteredWasm)
}

function taskResultVM(config, cont) {
    if (config.actor.stop_early < 0) {
        var args = buildArgs(["-m", "-output"], config)
        execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
            if (error) return logger.error('stderr %s', stderr)
            logger.info('solved task %s', stdout)
            cont(JSON.parse(stdout))
        })
    }
    else {
        var args = buildArgs(["-m", "-location", config.actor.stop_early.toString()], config) // need to have something new here
        execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
            if (error) return logger.error('stderr %s', stderr)
            logger.info('exited early %s', stdout)
            cont({steps: config.actor.stop_early, result:JSON.parse(stdout)})
        })
    }
}

exports.taskResultVM = taskResultVM

function uploadIPFS(fname) {
    return new Promise(function (cont,err) {
        fs.readFile(fname, function (err, buf) {
            ipfs.files.add([{content:buf, path:fname}], function (err, res) {
                cont(res[0])
            })
        })
    })
}


function parseId(str) {
    var res = ""
    for (var i = 0; i < str.length; i++) res = (str.charCodeAt(i)-65).toString(16) + res
    return "0x" + res;
}

function debugIPFS(lst) {
    return lst.map(function (el) {
        return {name:el.name, size:el.content.length}
    })
}
    
function getIPFSFiles(fileid, cont) {
    ipfs.get(fileid, function (err, stream) {
        if (err) return logger.error(err)
        var len = fileid.length+1
        var lst = []
        stream.on('data', (file) => {
            if (!file.content) return
            var chunks = []
            var name = file.path.substr(len)
            if (name && name != config.code_file) config.files.push(name)
            file.content.on("data", function (chunk) {
                chunks.push(chunk);
            })
            file.content.on("end", function () {
                lst.push({name:name, content:Buffer.concat(chunks)})
                logger.info("Got file %s", file.path)
            })
        })
        stream.on('end', function () {
            logger.info("This stream ended, got files", debugIPFS(lst))
            writeFiles(lst).then(() => cont())
        })
    })
}

function getIPFSFilesPromise(fileid) {
    return new Promise(function (cont,err) { getIPFSFiles(fileid, cont) })
}

function getIPFSToFile(fileid, fname, cont) {
    logger.info("trying to get code file", {fileid:fileid, fname:fname})
    ipfs.get(fileid, function (err, stream) {
        if (err) return logger.error(err)
        var len = fileid.length+1
        var lst = []
        stream.on('data', (file) => {
            if (!file.content) return
            var chunks = []
            file.content.on("data", function (chunk) {
                chunks.push(chunk);
            })
            file.content.on("end", function () {
                lst.push({name:fname, content:Buffer.concat(chunks)})
                logger.info("Got file %s", file.path)
            })
        })
        stream.on('end', function () {
            logger.info("This stream ended, got files", debugIPFS(lst))
            writeFiles(lst).then(() => cont())
        })
    })
}

function getIPFSToFilePromise(fileid, fname) {
    return new Promise(function (cont,err) { getIPFSToFile(fileid, fname, cont) })
}

function parseData(lst, size) {
    var res = []
    lst.forEach(function (v) {
        for (var i = 1; i <= 32; i++) {
            res.push(parseInt(v.substr(i*2, 2), 16))
        }
    })
    logger.info("parsing data", {res:res})
    res.length = size
    logger.info("parsing data", {res:res})
    return Buffer.from(res)
}

async function loadFilesFromChain(config, id) {
    var lst = await filesystem.methods.getFiles(id).call(send_opt)
    var res = []
    logger.info("got files", {files:lst})
    for (var i = 0; i < lst.length; i++) {
        var ipfs_hash = await filesystem.methods.getHash(lst[i]).call(send_opt)
        var name = await filesystem.methods.getName(lst[i]).call(send_opt)
        config.files.push(name)
        if (ipfs_hash) {
            logger.info("Loading %s from %s", name, ipfs_hash)
            await getIPFSToFilePromise(ipfs_hash, name)
            continue
        }
        var size = await filesystem.methods.getByteSize(lst[i]).call(send_opt)
        var data = await filesystem.methods.getData(lst[i]).call(send_opt)
        logger.info("file name %s", name, {content:data, size: size})
        var buf = parseData(data, size)
        res.push({name:name, content:buf})
    }
    return writeFiles(res)
}

function arrange(arr) {
    var res = []
    var acc = ""
    arr.forEach(function (b) { acc += b; if (acc.length == 64) { res.push("0x"+acc); acc = "" } })
    if (acc != "") res.push("0x"+acc)
    return res
}

async function createFile(fname, buf) {
    var nonce = await web3.eth.getTransactionCount(base)
    var arr = []
    for (var i = 0; i < buf.length; i++) {
        if (buf[i] > 15) arr.push(buf[i].toString(16))
        else arr.push("0" + buf[i].toString(16))
    }
    logger.info("Nonce %s file", nonce, {arr:arr, buf:buf, arranged: arrange(arr)})
    var tx = await filesystem.methods.createFileWithContents(fname, nonce, arrange(arr), buf.length).send(send_opt)
    var id = await filesystem.methods.calcId(nonce).call(send_opt)
    var lst = await filesystem.methods.getData(id).call(send_opt)
    logger.info("Ensure upload", {data:lst})
    return id
}

exports.createFile = createFile

async function createIPFSFile(config, fname, new_name) {
    new_name = new_name || fname
    var hash = await uploadIPFS(fname)
    var info = JSON.parse(await exec(config, ["-hash-file", fname]))
    var nonce = await web3.eth.getTransactionCount(base)
    logger.info("Adding ipfs file", {name:new_name, size:info.size, ipfs_hash:hash.hash, data:info.root, nonce:nonce})
    await filesystem.methods.addIPFSFile(new_name, info.size, hash.hash, info.root, nonce).send(send_opt)
    var id = await filesystem.methods.calcId(nonce).call(send_opt)
    return id
}

exports.createIPFSFile = createIPFSFile

function writeFile(fname, buf) {
    return new Promise(function (cont,err) { fs.writeFile(fname, buf, function (err, res) { cont() }) })
}

function readFile(fname) {
    return new Promise(function (cont,err) { fs.readFile(fname, function (err, buf) { if (err) { logger.info("Error reading file, assuming it should be empty", {err:err}); cont(Buffer.from("")) } else cont(buf) }) })
}
    
exports.readFile = readFile

async function loadMixedCode(config, fileid) {
    logger.info("mixed code %s", fileid)
    var hash = await filesystem.methods.getIPFSCode(fileid).call(send_opt)
    var fname = "task." + getExtension(config.code_type)
    if (hash) {
        return getIPFSToFilePromise(hash, fname)
    }
    else {
        var res = await filesystem.methods.getCode(fileid).call(send_opt)
        // dropping "0x"
        var buf = Buffer.from(res.substr(2), "hex")
        return writeFile(fname, buf)
    }
}

// perhaps here we should just get and write to normal files
function getStorage(config, cont) {
    var fileid = config.storage
    logger.info("getting storage %s", fileid, config.storage)
    if (config.storage_type == Storage.BLOCKCHAIN) {
        var fileid = parseId(config.storage)
        loadMixedCode(config, fileid).then(function (res) {
            // if (err) return logger.error("Cannot load file from blockchain",err)
            logger.info("loaded from blockchain %s", res)
            // then rest of the files
            // push them to config
            loadFilesFromChain(config, fileid).then(cont)
        })
    }
    // First collect, then write
    else ipfs.get(fileid, function (err, stream) {
        if (err) return logger.error(err)
        var len = fileid.length+1
        var lst = []
        stream.on('data', (file) => {
            if (!file.content) return
            var chunks = []
            var name = file.path.substr(len)
            if (name && name != config.code_file) config.files.push(name)
            file.content.on("data", function (chunk) {
                chunks.push(chunk);
            })
            file.content.on("end", function () {
                lst.push({name:name, content:Buffer.concat(chunks)})
                logger.info("Got file %s", file.path)
            })
        })
        stream.on('end', function () {
            logger.info("This stream ended, got files", debugIPFS(lst))
            writeFiles(lst).then(() => cont())
        })
    })
}

exports.getStorage = getStorage

function getLocation(place, config, cont) {
    var args = buildArgs(["-m", "-location", place], config)
    execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
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
    execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getStep = getStep

function getErrorStep(place, config, cont) {
    var args = insertError(["-m", "-error-step", place], config)
    execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
        if (error) logger.error('stderr %s', stderr)
        else cont(JSON.parse(stdout))
    })
}

exports.getErrorStep = getErrorStep

function getFinality(place, config, cont) {
    var args = insertError(["-m", "-final", place], config)
    execFile(wasm_path, args, {cwd:dir}, function (error, stdout, stderr) {
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

exports.getLeaf = function (lst, loc) {
    if (loc % 2 == 0) return lst[0]
    else return lst[1]
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

async function upload(data) {
    logger.info("Going to upload")
    var sz = data.length.toString(16)
    if (sz.length == 1) sz = "000" + sz
    else if (sz.length == 2) sz = "00" + sz
    else if (sz.length == 3) sz = "0" + sz

    var init_code = "61"+sz+"600061"+sz+"600e600039f3"

    var contract = new web3.eth.Contract([])

    var hex_data = Buffer.from(data).toString("hex")

    contract = await contract.deploy({data: '0x' + init_code + hex_data}).send(send_opt)
    logger.info("storage added to", contract.options.address)
    
    return contract.options.address
}
    
exports.getPlace = function (idx) {
    var idx1 = parseInt(idx.idx1)
    var idx2 = parseInt(idx.idx2)
    return Math.floor((idx2-idx1)/2 + idx1)
}

exports.storeHash = function (root, data) {
    var file = new File({root: root, data: data})
    return file.save()
}

exports.upload = upload

exports.web3 = web3
exports.config = addresses
exports.ipfs = ipfs
exports.send_opt = send_opt
exports.contract = contract
exports.iactive = iactive
exports.base = base

exports.logger = logger

return exports

}
