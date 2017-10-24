
var fs = require("fs")
var winston = require("winston")
var http = require('http').createServer()
var io = require("socket.io")(http)
var common = require("./common")
var execFile = require('child_process').execFile
var contract = common.contract
var iactive = common.iactive
var logger = common.logger

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }))
}

function execInPath(fname, path_name) {
    execFile("node", [fname, path_name], (error, stdout, stderr) => {
        if (stderr) logger.error('error %s', stderr)
        logger.info('other output %s', stdout)
    })
}

var solver = { error: false, error_location: 0 }
var verifier = { error: false, error_location: 0 }

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
        execInPath("giver.js", path)
    })
    socket.on("setup_error", function (obj) {
        logger.info("new configuration", obj)
        verifier = obj.verifier
        solver = obj.solver
    })
    socket.on("config", function (obj) {
        // logger.info("process changed %s", obj.message)
        io.to("ui").emit("config", obj)
    })
})

// We should listen to contract events

contract.Posted("latest").watch(function (err, ev) {
    if (err) {
        logger.error(err)
        return
    }
    var id = ev.args.id.toString(16)
    var path = "tmp.solver_" + id
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    var obj = {
        message: "Starting solver",
        id: id,
        giver: ev.args.giver,
        hash: ev.args.hash,
        filehash:ev.args.file,
        inputhash:ev.args.input,
        inputfile: ev.args.input_file,
        actor: solver,
    }
    logger.info("Creating task", obj)
    io.emit("event", obj)

    fs.writeFileSync(path + "/solver.json", JSON.stringify(obj))
    execInPath("solver.js", path)
})

contract.Solved("latest").watch(function (err, ev) {
    if (err) {
        logger.error(err)
        return
    }
    logger.info("solved", ev.args)
    if (ev.args.solver == common.base && !verifier.check_own) return logger.info("Not going to verify", verifier)
    var id = ev.args.id.toString(16)
    var path = "tmp.verifier_" + id
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    var obj = {
        message: "Starting verifier",
        id: id,
        solver: ev.args.solver,
        giver: ev.args.giver,
        hash: ev.args.hash,
        init: ev.args.init,
        filehash:ev.args.file,
        inputhash:ev.args.input,
        inputfile: ev.args.input_file,
        steps:ev.args.steps.toString(),
        actor: verifier,
    }
    var id = ev.args.id.toString()
    io.emit("event", obj)
    fs.writeFileSync(path + "/verifier.json", JSON.stringify(obj))
    execInPath("verifier.js", path)
})

/// check verifier events

iactive.Reported("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Reported ", ev)
    io.emit("reply", {message:"Reported intermediate state", uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber(), hash:ev.arr[0]})
})

iactive.NeedErrorPhases("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Query ", ev)
    io.emit("event", {message: "Query for error phases", uniq:ev.id, idx1:ev.idx1.toNumber()})
})

iactive.PostedPhases("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Phases ", ev)
    io.emit("event", {message:"Posted phases", uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
})


iactive.SelectedErrorPhase("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Prover selected error phase", ev)
    io.emit("event", {message: "Prover selected error phase", uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
})

/// solver events

iactive.StartChallenge("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    logger.info("Got challenge", ev)
    io.emit("event", {
        message:"Challenging solution",
            prover: ev.args.p,
            challenger: ev.args.c,
            uniq: ev.args.uniq,
            init: ev.args.s,
            result: ev.args.e,
            size: ev.args.par.toNumber(),
        })
})

iactive.StartFinalityChallenge("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    logger.info("Got finality challenge", ev)
    io.emit("event", {
        message:"Challenging finality",
            prover: ev.args.p,
            challenger: ev.args.c,
            uniq: ev.args.uniq,
            init: ev.args.s,
            result: ev.args.e,
        })
})

function myId(id) {
    return !!challenges[ev.id]
}

iactive.Queried("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Query ", ev)
    io.emit("event", {message: "Query", uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber()})
})

iactive.PostedErrorPhases("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Error phases ", ev)
    io.emit("event", {message: "Error phases", uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
})

iactive.SelectedPhase("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Challenger selected phase ", ev)
    io.emit("event", {message: "Challenger selected phase", uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
})

iactive.WinnerSelected("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    logger.info("Selected winner for challenge", ev)
    io.emit("event", {message: "Selected winner for challenge", uniq:ev.id})
})

contract.Finalized("latest").watch(function (err,ev) {
    if (err) return logger.error(err);
    ev = ev.args
    logger.info("Finalized a task", ev)
    io.emit("event", {message: "Finalized task", uniq:ev.id})
})

function tick() {
    contract.tick(common.send_opt, function (err, res) {
        if (!err) logger.info("tick %s", res)
    })
}

setInterval(tick, 10000)

http.listen(22448, function(){
    logger.info("listening on *:22448")
})

