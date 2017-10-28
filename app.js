
var fs = require("fs")
var winston = require("winston")
var http = require('http').createServer()
var io = require("socket.io")(http)
var common = require("./common").make(process.cwd())
var execFile = require('child_process').execFile

var contract = common.contract
var iactive = common.iactive
var logger = common.logger

var giver = require("./giver")
var solver = require("./solver")
var verifier = require("./verifier")

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }))
}

/*
function execInPath(fname, path_name) {
    execFile("node", [fname, path_name], (error, stdout, stderr) => {
        if (stderr) logger.error('error %s', stderr)
        logger.info('other output from %s %s', fname, stdout)
    })
}*/

var solver_conf = { error: false, error_location: 0 }
var verifier_conf = { error: false, error_location: 0, check_own: true }

var CodeType = common.CodeType
var Storage = common.Storage

io.on("connection", function(socket) {
    logger.info("Got new socket.io client")
    io.emit("client", {})
    socket.on("request-ui", function (str) {
        socket.join("ui")
        logger.info("Got user interface")
    })
    socket.on("new_task", function (obj) {
        var path = "tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
        if (!fs.existsSync(path)) fs.mkdirSync(path)
        fs.writeFileSync(path + "/task.wast", obj.task)
        fs.writeFileSync(path + "/input.bin", JSON.stringify(obj.input))
        var config = {taskfile:"task.wast", inputfile:"input.bin", code_type: CodeType.WAST, storage:Storage.IPFS}
        giver.make(process.cwd()+"/"+path, config)
        // fs.writeFileSync(path + "/giver.json", JSON.stringify({taskfile:"task.wast", inputfile:"input.bin", code_type: CodeType.WAST, storage:Storage.IPFS}))
        // execInPath("giver.js", path)
    })
    socket.on("new_wasm_task", function (obj) {
        var path = "tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
        if (!fs.existsSync(path)) fs.mkdirSync(path)
        logger.info("Creating WASM task", obj)
        fs.writeFileSync(path + "/task.wasm", obj.task, 'binary')
        fs.writeFileSync(path + "/input.bin", JSON.stringify(obj.input))
        giver.make(process.cwd()+"/"+path, {taskfile:"task.wasm", inputfile:"input.bin", code_type: CodeType.WASM, storage:Storage.IPFS})
        // fs.writeFileSync(path + "/giver.json", JSON.stringify({taskfile:"task.wasm", inputfile:"input.bin", code_type: CodeType.WASM, storage:Storage.IPFS}))
        // execInPath("giver.js", path)
    })
    socket.on("new_blockchain_task", function (obj) {
        var path = "tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
        if (!fs.existsSync(path)) fs.mkdirSync(path)
        logger.info("Creating WASM task for uploading into blockchain", obj)
        fs.writeFileSync(path + "/task.wasm", obj.task, 'binary')
        fs.writeFileSync(path + "/input.bin", JSON.stringify(obj.input))
        giver.make(process.cwd()+"/"+path, {taskfile:"task.wasm", inputfile:"input.bin", code_type: CodeType.WASM, storage:Storage.BLOCKCHAIN})
        // fs.writeFileSync(path + "/giver.json", JSON.stringify({taskfile:"task.wasm", inputfile:"input.bin", code_type: CodeType.WASM, storage:Storage.BLOCKCHAIN}))
        // execInPath("giver.js", path)
    })
    socket.on("setup_error", function (obj) {
        logger.info("new configuration", obj)
        verifier_conf = obj.verifier
        solver_conf = obj.solver
    })
    socket.on("config", function (obj) {
        // logger.info("process changed %s", obj.message)
        io.to("ui").emit("config", obj)
    })
})

// We should listen to contract events

contract.events.Posted(function (err, ev) {
    if (err) return logger.error("Event error", err)
    var args = ev.returnValues
    logger.info("posted", args)
    var id = args.id.toString()
    var path = "tmp.solver_" + id
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    var obj = {
        message: "Starting solver",
        id: id,
        giver: args.giver,
        init: args.hash,
        storage:args.stor,
        code_type: parseInt(args.ct),
        storage_type: parseInt(args.cs),
        actor: solver_conf,
    }
    logger.info("Creating task", obj)
    io.emit("event", obj)
    
    solver.make(process.cwd()+"/"+path, obj)

    // fs.writeFileSync(path + "/solver.json", JSON.stringify(obj))
    // execInPath("solver.js", path)
})

contract.events.Solved("latest", function (err, ev) {
    if (err) return logger.error("Event error", err)
    var args = ev.returnValues
    logger.info("solved", args)
    if (args.solver.toLowerCase() == common.base.toLowerCase() && !verifier_conf.check_own) return logger.info("Not going to verify", verifier_conf)
    var id = args.id.toString()
    var path = "tmp.verifier_" + id
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    var obj = {
        message: "Starting verifier",
        id: id,
        solver: args.solver,
        giver: args.giver,
        hash: args.hash,
        init: args.init,
        storage: args.stor,
        code_type: parseInt(args.ct),
        storage_type: parseInt(args.cs),
        steps: args.steps.toString(),
        actor: verifier_conf,
    }
    io.emit("event", obj)
    verifier.make(process.cwd()+"/"+path, obj)
    /*
    fs.writeFileSync(path + "/verifier.json", JSON.stringify(obj))
    execInPath("verifier.js", path)
    */
})

/// check verifier events

iactive.events.Reported("latest", function (err,ev) {
    // console.log(err)
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Reported ", args)
    io.emit("event", {message:"Reported intermediate state", uniq:args.id, idx1:parseInt(args.idx1), idx2:parseInt(args.idx2), hash:args.arr[0]})
})

iactive.events.NeedErrorPhases("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Query ", args)
    io.emit("event", {message: "Query for error phases", uniq:args.id, idx1:parseInt(args.idx1)})
})

iactive.events.PostedPhases("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Phases ", args)
    io.emit("event", {message:"Posted phases", uniq:args.id, idx1:parseInt(args.idx1), phases:args.arr})
})


iactive.events.SelectedErrorPhase("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Prover selected error phase", args)
    io.emit("event", {message: "Prover selected error phase", uniq:args.id, idx1:parseInt(args.idx1), phase:parseInt(args.phase)})
})

/// solver events

iactive.events.StartChallenge("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Got challenge", args)
    io.emit("event", {
        message:"Challenging solution",
            prover: args.p,
            challenger: args.c,
            uniq: args.uniq,
            init: args.s,
            result: args.e,
            size: parseInt(args.par),
        })
})

iactive.events.StartFinalityChallenge("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Got finality challenge", args)
    io.emit("event", {
        message:"Challenging finality",
            prover: args.p,
            challenger: args.c,
            uniq: args.uniq,
            init: args.s,
            result: args.e,
        })
})

iactive.events.Queried("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Query ", args)
    io.emit("event", {message: "Query", uniq:args.id, idx1:parseInt(args.idx1), idx2:parseInt(args.idx2)})
})

iactive.events.PostedErrorPhases("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Error phases ", args)
    io.emit("event", {message: "Error phases", uniq:args.id, idx1:parseInt(args.idx1), phases:args.arr})
})

iactive.events.SelectedPhase("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Challenger selected phase ", args)
    io.emit("event", {message: "Challenger selected phase", uniq:args.id, idx1:parseInt(args.idx1), phase:parseInt(args.phase)})
})

iactive.events.WinnerSelected("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Selected winner for challenge", args)
    io.emit("event", {message: "Selected winner for challenge", uniq:args.id})
})

contract.events.Finalized("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Finalized a task", args)
    io.emit("event", {message: "Finalized task", uniq:args.id})
})

contract.events.allEvents(function (err,ev) {
    logger.info("event, is this better")
})

iactive.events.allEvents(function (err,ev) {
    logger.info("event, is this better")
})

async function update() {
    var block = await common.web3.eth.getBlockNumber()
    var balance = await common.web3.eth.getBalance(common.config.base)
    var obj = {block:block, address:common.config.base, balance: common.web3.utils.fromWei(balance, "ether")}
    logger.info("Info to ui", obj)
    io.emit("info", obj)
}

function tick() {
    contract.methods.tick().send(common.send_opt, function (err, res) {
        if (!err) logger.info("tick %s", res)
    })
}

// setInterval(tick, common.config.timeout)
setInterval(update, 10000)

http.listen(22448, function(){
    logger.info("listening on *:22448")
})

