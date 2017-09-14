
var fs = require("fs")
// var exec = require('child_process').exec
var http = require('http').createServer()
var io = require("socket.io")(http)
var Web3 = require('web3')
var web3 = new Web3()
var execFile = require('child_process').execFile
var ipfsAPI = require('ipfs-api')

// connect to ipfs daemon API server
var ipfs = ipfsAPI('programming-progress.com', '5001', {protocol: 'http'})

web3.setProvider(new web3.providers.HttpProvider('http://programming-progress.com:8545'))

// var base = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1"
var base = "0x9acbcf2d9bd157999ae5541c446f8d6962da1d4d"

var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var send_opt = {from:base, gas: 4000000}

// var contract = new web3.eth.Contract(abi, "0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab")
var contractABI = web3.eth.contract(abi)
var contract = contractABI.at("0x21bdd8db134abeb218d523d14f5605ac18116902")

var iactiveABI = web3.eth.contract(JSON.parse(fs.readFileSync("contracts/Interactive2.abi")))
var iactive = iactiveABI.at("0x398f9e1313869333363534e4edc45b03643bed37")

var wasm_path = "../webasm/interpreter/wasm"

io.on("connection", function(socket) {
    console.log("Got client")
    io.emit("client", {})
    socket.on("msg", function (str) {
        console.log(str)
    })
    socket.on("new_task", function (obj) {
        // store into IPFS, get ipfs address
        ipfs.files.add(new Buffer(obj), function (err, res) {
            if (err) {
                console.log(err)
                return
            }
            console.log(res)
            var filename = res[0].hash + ".wast"
            // store into filesystem
            fs.writeFile(filename, obj, function () {
                // run init script
                execFile(wasm_path, ["-m", "-init", "0", filename], (error, stdout, stderr) => {
                    if (error) {
                        console.error('stderr', stderr)
                        return
                    }
                    console.log('stdout', stdout)
                    // It should give the initial state hash, post it to contract
                    contract.add(JSON.parse(stdout), res[0].hash, send_opt, function (err, tr) {
                        if (err) console.log(err)
                        else {
                            console.log("Success", tr)
                            io.emit("task_success", tr)
                        }
                    })
                })
            })
        })
    })
})

function solveTask(obj) {
    var filename = obj.filehash + ".wast"
    // store into filesystem
    fs.writeFile(filename, obj.file, function () {
        execFile(wasm_path, ["-m", "-init", "0", filename], (error, stdout, stderr) => {
            if (error) {
                console.error('stderr', stderr)
                return
            }
            var inithash = JSON.parse(stdout)
            if (inithash == obj.hash) {
                console.log("Initial hash matches")
            }
            else {
                console.log("Initial hash was wrong")
                return
            }
            execFile(wasm_path, ["-m", "-result", "0", filename], function (error, stdout, stderr) {
                if (error) {
                    console.error('stderr', stderr)
                    return
                }
                var res = JSON.parse(stdout)
                contract.solve(obj.id, res.result, res.steps, send_opt, function (err, tr) {
                        if (err) console.log(err)
                        else {
                            console.log("Success", tr)
                            io.emit("solve_success", tr)
                        }
                    })
            })
        })
    })
}

function verifyTask(obj) {
    var filename = obj.filehash + ".wast"
    // store into filesystem
    fs.writeFile(filename, obj.file, function () {
        execFile(wasm_path, ["-m", "-init", "0", filename], (error, stdout, stderr) => {
            if (error) {
                console.error('stderr', stderr)
                return
            }
            var inithash = JSON.parse(stdout)
            if (inithash == obj.init) {
                console.log("Initial hash matches")
            }
            else {
                console.log("Initial hash was wrong")
                return
            }
            execFile(wasm_path, ["-m", "-result", "0", filename], function (error, stdout, stderr) {
                if (error) {
                    console.error('stderr', stderr)
                    return
                }
                var res = JSON.parse(stdout)
                if (res.result != obj.hash) console.log("Result mismatch")
                else if (res.steps != obj.steps) {
                    console.log("Wrong number of steps")
                    contract.challenge(obj.id, function (err, tx) {
                        if (!err) console.log(tx, "challenge initiated")
                    })
                }
                else console.log("Seems correct")
            })
        })
    })
}

function getFile(fileid, cont) {
    ipfs.get(fileid, function (err, stream) {
        if (err) {
            console.log(err)
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

var task_to_file = {}

// We should listen to contract events

contract.Posted("latest").watch(function (err, ev) {
    if (err) {
        console.log(err)
        return
    }
    var id = ev.args.id.toString()
    task_to_file[id] = ev.args.file + ".wasm"
    io.emit("posted", {giver: ev.args.giver, hash: ev.args.hash, file:ev.args.file, id:id})
    // download file from IPFS
    getFile(ev.args.file, function (filestr) {
        solveTask({giver: ev.args.giver, hash: ev.args.hash, file:filestr, filehash:ev.args.file, id:id})
    })
})

contract.Solved("latest").watch(function (err, ev) {
    if (err) {
        console.log(err)
        return
    }
    var id = ev.args.id.toString()
    io.emit("solved", {hash: ev.args.hash, file:ev.args.file, init: ev.args.init, id:id, steps:ev.args.steps.toString()})
    task_to_file[id] = ev.args.file + ".wasm"
    getFile(ev.args.file, function (filestr) {
        verifyTask({hash: ev.args.hash, file: filestr, filehash:ev.args.file, init: ev.args.init, id:id, steps:ev.args.steps.toString()})
    })
})

var challenges = {}

function getLocation(fname, place, cont) {
    execFile(wasm_path, ["-m", "-location", place, "-case", "0", fname], function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

function getStep(fname, place, cont) {
    execFile(wasm_path, ["-m", "-step", place, "-case", "0", fname], function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

function replyChallenge(id, idx1, idx2) {
    if (!challenges[id]) return
    var fname = task_to_file[challenges[id].task]
    var place = Math.floor((idx2-idx1)/2)
    if (idx1 + 1 == idx2) {
        // Now we are sending the intermediate states
        getStep(fname, idx1, function (err,obj) {
            iactive.postPhases(id, idx1, obj.states, function (err,tx) {
                if (err) console.log(err)
                else console.log("Posted phases", tx)
            })
        })
        return
    }
    getLocation(fname, place, function (hash) {
        iactive.report(id, idx1, idx2, [hash], function (err,tx) {
            if (err) console.log(err)
            else console.log("Replied to challenge", tx)
        })
    })
}

function replyPhases(id, idx1, arr) {
    if (!challenges[id]) return
    var fname = task_to_file[challenges[id].task]
    // Now we are checking the intermediate states
    getStep(fname, idx1, function (err,obj) {
        for (var i = 1; i < arr.length; i++) {
            if (obj.states[i] != arr[i]) {
                iactive.selectPhase(id, idx1, arr[i-1], i-1, function (err,tx) {
                    if (err) console.log(err)
                    else console.log("Selected wrong phase", tx)
                })
                return
            }
        }
    })
}

var phase_table = {
    0: "fetch",
    1: "init",
    2: "reg1",
    3: "reg2",
    4: "reg3",
    5: "alu",
    6: "write1",
    7: "write2",
    8: "pc",
    9: "break_ptr",
    10: "stack_ptr",
    11: "call_ptr",
    12: "memsize",
}

function submitProof(id, idx1, phase) {
    if (!challenges[id]) return
    var fname = task_to_file[challenges[id].task]
    // Now we are checking the intermediate states
    getStep(fname, idx1, function (err,obj) {
        var proof = obj[phase_table[phase]]
        var merkle = proof.proof || []
        var loc = proof.location || 0
        var fetched = proof.op || 0
        var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
        var vm = proof.vm || { code: "0x00", stack:"0x00", break_stack1:"0x00", break_stack2:"0x00", call_stack:"0x00", calltable:"0x00",
                               globals : "0x00", memory:"0x00", calltypes:"0x00", pc:0, stack_ptr:0, break_ptr:0, call_ptr:0, memsize:0}
        iactive.callJudge(id, idx1, phase, merkle, loc, fetched, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                           [vm.code, vm.stack, vm.memory, vm.call_stack, vm.break_stack1, vm.break_stack2, vm.globals, vm.calltable, vm.calltypes],
                           [vm.pc, vm.stack_ptr, vm.break_ptr, vm.call_ptr, vm.memsize])
    })
}

function replyReported(id, idx1, idx2, otherhash) {
    if (!challenges[id]) return
    var fname = task_to_file[challenges[id].task]
    var place = Math.floor((idx2-idx1)/2)
    getLocation(fname, place, function (hash) {
        var res = hash == otherhash ? 0 : 1
        iactive.query(id, idx1, idx2, res, function (err,tx) {
            if (err) console.log(err)
            else console.log("Sent query", tx)
        })
    })
}

iactive.StartChallenge("latest").watch(function (err,ev) {
    if (err) {
        console.log(err)
        return
    }
    contract.queryChallenge.call(ev.uniq, function (err, id) {
        if (err) {
            console.log(err)
            return
        }
        var id = id.toString()
        challenges[ev.uniq] = {
            prover: ev.p,
            task: id.toString(),
            challenger: ev.c,
            init: ev.s,
            result: ev.e,
            size: ev.par,
        }
        if (ev.p == base) replyChallenge(ev.uniq, ev.idx1.toNumber(), ev.idx2.toNumber())
    })
})

iactive.Reported("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    replyReported(ev.uniq, ev.idx1.toNumber(), ev.idx2.toNumber(), ev.arr[0])
})

iactive.Queried("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    replyChallenge(ev.uniq, ev.idx1.toNumber(), ev.idx2.toNumber())
})

iactive.PostedPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    replyPhases(ev.uniq, ev.idx1.toNumber(), ev.arr)
})

iactive.SelectedPhase("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    submitProof(ev.uniq, ev.idx1.toNumber(), ev.phase.toString())
})

http.listen(22448, function(){
    console.log("listening on *:22448")
})

