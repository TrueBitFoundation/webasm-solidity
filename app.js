
var fs = require("fs")
var http = require('http').createServer()
var io = require("socket.io")(http)
var common = require("./common")
var execFile = require('child_process').execFile
var contract = common.contract
var iactive = common.iactive

function execInPath(fname, path_name) {
    execFile("node", [fname, path_name], (error, stdout, stderr) => {
        if (stderr) console.error('error', stderr)
        console.log('other output', stdout)
    })
}

var solver = { error: false, error_location: 0 }
var verifier = { error: false, error_location: 0 }

io.on("connection", function(socket) {
    console.log("Got client")
    io.emit("client", {})
    socket.on("msg", function (str) {
        console.log(str)
    })
    socket.on("new_task", function (obj) {
        // store into IPFS, get ipfs address
        var path = "tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
        if (!fs.existsSync(path)) fs.mkdirSync(path)
        fs.writeFileSync(path + "/task.wast", obj.task)
        fs.writeFileSync(path + "/input.bin", JSON.stringify(obj.input))
        execInPath("giver.js", path)
    })
    socket.on("setup_error", function (obj) {
        verifier.error = obj.verifier_error
        solver.error = obj.solver_error
        verifier.error_location = obj.verifier_location
        solver.error_location = obj.solver_location
    })
})



// We should listen to contract events

contract.Posted("latest").watch(function (err, ev) {
    if (err) {
        console.log(err)
        return
    }
    var id = ev.args.id.toString(16)
    var path = "tmp.solver_" + id
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    var obj = {
        id: id,
        giver: ev.args.giver,
        hash: ev.args.hash,
        filehash:ev.args.file,
        inputhash:ev.args.input,
        inputfile: ev.args.input_file,
        actor: solver,
    }
    console.log(obj)
    io.emit("posted", obj)

    fs.writeFileSync(path + "/solver.json", JSON.stringify(obj))
    execInPath("solver.js", path)
})

contract.Solved("latest").watch(function (err, ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("solved", ev.args)
    var id = ev.args.id.toString(16)
    var path = "tmp.verifier_" + id
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    var obj = {
        id: id,
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
    io.emit("solved", obj)
    fs.writeFileSync(path + "/verifier.json", JSON.stringify(obj))
    execInPath("verifier.js", path)
})

/// check verifier events

iactive.Reported("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Reported ", ev)
    io.emit("reply", {uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber(), hash:ev.arr[0]})
})

iactive.NeedErrorPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Query ", ev)
    io.emit("query", {uniq:ev.id, idx1:ev.idx1.toNumber()})
})

iactive.PostedPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Phases ", ev)
    io.emit("phases", {uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
})


iactive.SelectedErrorPhase("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Prover selected error phase ", ev)
    io.emit("phase_selected", {uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
})

/// solver events

iactive.StartChallenge("latest").watch(function (err,ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("Got challenge", ev)
    io.emit("challenge", {
            prover: ev.args.p,
            challenger: ev.args.c,
            uniq: ev.args.uniq,
            init: ev.args.s,
            result: ev.args.e,
            size: ev.args.par.toNumber(),
        })
})

iactive.StartFinalityChallenge("latest").watch(function (err,ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("Got finality challenge", ev)
    io.emit("challenge", {
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
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Query ", ev)
    io.emit("query", {uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber()})
})

iactive.PostedErrorPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Error phases ", ev)
    io.emit("phases", {uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
})

iactive.SelectedPhase("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Challenger selected phase ", ev)
    io.emit("phase_selected", {uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
})

http.listen(22448, function(){
    console.log("listening on *:22448")
})

