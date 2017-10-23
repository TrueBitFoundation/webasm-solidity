
var fs = require("fs")
var http = require('http').createServer()
var io = require("socket.io")(http)
var common = require("./common")
var execFile = require('child_process').execFile
var contract = common.contract

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
/*
    task_to_file[id] = ev.args.file + ".wast"
    task_to_inputfile[id] = ev.args.input + ".bin"
    getFile(ev.args.file, function (filestr) {
        getInputFile(ev.args.input, ev.args.input_file, function (input) {
            verifyTask({hash: ev.args.hash, file: filestr, filehash:ev.args.file, init: ev.args.init, id:id, input:input.data, inputhash:input.name,
                        steps:ev.args.steps.toString()}, verifier)
        })
    }) */
})



http.listen(22448, function(){
    console.log("listening on *:22448")
})

