
var fs = require("fs")
var winston = require("winston")
var http = require('http').createServer()
var io = require("socket.io")(http)
var common = require("./common").make(process.cwd())
var execFile = require('child_process').execFile

var contract = common.contract
var iactive = common.iactive
var logger = common.logger
var send_opt = common.send_opt

var giver = require("./giver")
var solver = require("./solver")
var verifier = require("./verifier")

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }))
}

var solver_conf = { error: false, error_location: 0, stop_early: -1, deposit: 1 }
var verifier_conf = { error: false, error_location: 0, check_own: true, stop_early: -1, deposit: 1 }

var enabled = true

var CodeType = common.CodeType
var Storage = common.Storage

io.on("connection", function(socket) {
    logger.info("Got new socket.io client")
    io.emit("client", {})
    socket.on("request-ui", function (str) {
        socket.join("ui")
        logger.info("Got user interface")
        update()
    })
    socket.on("make_deposit", function () {
        common.contract.methods.makeDeposit().send({from:common.config.base, gas: 400000, gasPrice:"21000000000", value: "100000000000000000"})
    })
    socket.on("new_task", function (obj) {
        var path = "tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
        if (!fs.existsSync(path)) fs.mkdirSync(path)
        logger.info("Creating task", obj)
        fs.writeFileSync(path + "/task.wast", obj.task)
        fs.writeFileSync(path + "/input.bin", JSON.stringify(obj.input))
        var config = {taskfile:"task.wast", inputfile:"input.bin", code_type: CodeType.WAST, storage:Storage.IPFS}
        giver.make(process.cwd()+"/"+path, config)
    })
    socket.on("new_wasm_task", function (obj) {
        var path = "tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
        if (!fs.existsSync(path)) fs.mkdirSync(path)
        logger.info("Creating WASM task", obj)
        fs.writeFileSync(path + "/task.wasm", obj.task, 'binary')
        fs.writeFileSync(path + "/input.bin", JSON.stringify(obj.input))
        giver.make(process.cwd()+"/"+path, {taskfile:"task.wasm", inputfile:"input.bin", code_type: CodeType.WASM, storage:Storage.IPFS})
    })
    socket.on("new_blockchain_task", function (obj) {
        var path = "tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
        if (!fs.existsSync(path)) fs.mkdirSync(path)
        logger.info("Creating WASM task for uploading into blockchain", obj)
        fs.writeFileSync(path + "/task.wasm", obj.task, 'binary')
        fs.writeFileSync(path + "/input.bin", JSON.stringify(obj.input))
        giver.make(process.cwd()+"/"+path, {taskfile:"task.wasm", inputfile:"input.bin", code_type: CodeType.WASM, storage:Storage.BLOCKCHAIN})
    })
    socket.on("setup_error", function (obj) {
        logger.info("new configuration", obj)
        verifier_conf = obj.verifier
        solver_conf = obj.solver
        enabled = obj.enabled
    })
    socket.on("config", function (obj) {
        // logger.info("process changed %s", obj.message)
        io.to("ui").emit("config", obj)
    })
    socket.on("logs", function (fname) {
        fs.readFile(fname, function (err, str) {
            if (err) return logger.error("Cannot load logs", err)
            logger.info("Sending logs from " + fname)
            socket.emit("logs", str.toString())
        })
    })
})

// We should listen to contract events

var handled_tasks = {}
var handled_solutions = {}

function startSolver(args) {
    logger.info("posted", args)
    if (!enabled) return logger.info("System disabled, ignoring")
    if (common.web3.utils.fromWei(args.deposit, "ether") > solver_conf.deposit) return logger.info("Deposit too large, do not solve")
    var id = args.id.toString()
    var path = "tmp.solver_" + id
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    handled_tasks[id] = true
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
}

async function pollTasks() {
    var next_id = await contract.methods.nextTask().call(send_opt)
    if (parseInt(next_id) == 0) return
    var id = (parseInt(next_id) - 1) + ""
    logger.info("latest task", {id:id})
    // 
    if (handled_tasks[id]) return
    handled_tasks[id] = true
    var info = await contract.methods.taskInfo(id).call(send_opt)
    logger.info("polled task", info)
    startSolver(info)
}

function startVerifier(args) {
    logger.info("solved", args)
    if (common.web3.utils.fromWei(args.deposit, "ether") > verifier_conf.deposit) return logger.info("Deposit too large, do not verify")
    if (parseInt(args.solver) == 0) return logger.info("Task has not been solved yet")
    if (handled_solutions[args.id]) return
    handled_solutions[args.id] = true
    if (!enabled) return logger.info("System disabled, ignoring")
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
        actor: verifier_conf,
    }
    io.emit("event", obj)
    verifier.make(process.cwd()+"/"+path, obj)
}

contract.events.Solved("latest", function (err, ev) {
    if (err) return logger.error("Event error", err)
    startVerifier(ev.returnValues)
})

contract.events.Posted(function (err, ev) {
    if (err) return logger.error("Event error", err)
    startSolver(ev.returnValues)
})

async function pollSolutions() {
    var next_id = await contract.methods.nextTask().call(send_opt)
    if (parseInt(next_id) == 0) return
    var id = (parseInt(next_id) - 1) + ""
    // 
    for (var i = 0; i < 3; i++) {
        var id2 = (parseInt(id)-i)+""
        if (handled_solutions[id2] || i > parseInt(id)) continue
        var info = await contract.methods.solutionInfo(id2).call(send_opt).error(err => logger.error("Cannot poll", err))
        logger.info("polled solution", info)
        startVerifier(info)
    }
}

/// check verifier events

iactive.events.Reported("latest", function (err,ev) {
    // console.log(err)
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Reported ", args)
    io.emit("event", {message:"Reported intermediate state", uniq:args.id, idx1:parseInt(args.idx1), idx2:parseInt(args.idx2), hash:args.arr[0]})
})

iactive.events.PostedPhases("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Phases ", args)
    io.emit("event", {message:"Posted phases", uniq:args.id, idx1:parseInt(args.idx1), phases:args.arr})
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

iactive.events.Queried("latest", function (err,ev) {
    if (err) return logger.error(err)
    var args = ev.returnValues
    logger.info("Query ", args)
    io.emit("event", {message: "Query", uniq:args.id, idx1:parseInt(args.idx1), idx2:parseInt(args.idx2)})
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

/*
contract.events.allEvents(function (err,ev) {
    logger.info("event, is this better")
})

iactive.events.allEvents(function (err,ev) {
    logger.info("event, is this better")
})
*/

async function update() {
    var block = await common.web3.eth.getBlockNumber()
    var balance = await common.web3.eth.getBalance(common.config.base)
    var deposit = await common.contract.methods.getDeposit(common.config.base).call()
    var obj = {block:block, address:common.config.base, balance: common.web3.utils.fromWei(balance, "ether"), deposit: common.web3.utils.fromWei(deposit, "ether")}
    // logger.info("Info to ui", obj)
    io.emit("info", obj)
    if (common.config.poll) {
        pollTasks()
        pollSolutions()
    }
}

function tick() {
    contract.methods.tick().send(common.send_opt, function (err, res) {
        if (!err) logger.info("tick %s", res)
    })
}

if (common.config.tick) setInterval(tick, common.config.timeout)
setInterval(update, 1000)

http.listen(22448, function(){
    logger.info("listening on *:22448")
})

