
var fs = require("fs")
var http = require('http').createServer()
var io = require("socket.io")(http)
var Web3 = require('web3')
var web3 = new Web3()
var execFile = require('child_process').execFile
var ipfsAPI = require('ipfs-api')

var appFile = require("./appFile")

var host = process.argv[2] || "localhost"

// connect to ipfs daemon API server
var ipfs = ipfsAPI(host, '5001', {protocol: 'http'})

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var solver_error = true
var verifier_error = false

console.log(web3.eth.coinbase)

// var base = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1"
var base = web3.eth.coinbase

var abi = JSON.parse(fs.readFileSync("contracts/Tasks.abi"))

var addresses = JSON.parse(fs.readFileSync("config.json"))

var send_opt = {from:base, gas: 4000000}

var contractABI = web3.eth.contract(abi)
var contract = contractABI.at(addresses.tasks)

var iactiveABI = web3.eth.contract(JSON.parse(fs.readFileSync("contracts/Interactive2.abi")))
var iactive = iactiveABI.at(addresses.interactive)

appFile.configure(web3)

var wasm_path = "ocaml-offchain/interpreter/wasm"

function initTask(fname, task, ifname, inp, cont) {
    fs.writeFile(fname, task, function () {
        fs.writeFile(ifname, inp, function () {
            // run init script
            execFile(wasm_path, ["-m", "-init", "-file", ifname, "-case", "0", fname], (error, stdout, stderr) => {
                if (error) {
                    console.error('initialization error', stderr)
                    return
                }
                console.log('initializing task', stdout)
                cont(JSON.parse(stdout))
            })
        })
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
        var input_buffer = appFile.inputToBuffer(obj.input)
        ipfs.files.add([new Buffer(obj.task), input_buffer], function (err, res) {
            if (err) {
                console.log(err)
                return
            }
            console.log(res)
            var filename = res[0].hash + ".wast"
            var inputfilename = res[1].hash + ".bin"
            // store into filesystem
            initTask(filename, obj.task, inputfilename, input_buffer, function (state) {
                contract.add(state, res[0].hash, res[1].hash, send_opt, function (err, tr) {
                    if (err) console.log(err)
                    else {
                        console.log("Success", tr)
                        io.emit("task_success", tr)
                    }
                })
            })
        })
    })
    socket.on("setup_error", function (obj) {
        verifier.error = obj.verifier_error
        solver.error = obj.solver_error
        verifier.error_location = obj.verifier_location
        solver.error_location = obj.solver_location
    })
})

function insertError(args, actor) {
    if (actor.error) {
        args.push("-insert-error")
        args.push("" + actor.error_location)
    }
    return args
}

function taskResult(filename, ifilename, actor, cont) {
    var args = insertError(["-m", "-result", "-file", ifilename, "-case", "0", filename], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) {
            console.error('stderr', stderr)
            return
        }
        console.log('solved task', stdout)
        cont(JSON.parse(stdout))
    })
}


function solveTask(obj, actor) {
    var filename = obj.filehash + ".wast"
    var ifilename = obj.inputhash + ".bin"
    // store into filesystem
    initTask(filename, obj.file, ifilename, obj.input, function (inithash) {
        if (inithash == obj.hash) {
            console.log("Initial hash matches")
        }
        else {
            console.log("Initial hash was wrong")
            return
        }
        taskResult(filename, ifilename, actor, function (res) {
            task_to_steps[obj.id] = res.steps
            contract.solve(obj.id, res.result, res.steps, send_opt, function (err, tr) {
                if (err) console.log(err)
                else {
                    console.log("Success", tr)
                    io.emit("solve_success", tr)
                    fs.access("blockchain.out", fs.constants.R_OK, function (err) {
                        if (!err) {
                            fs.readFile("blockchain.out", function (err, buf) {
                                if (err) console.log(err)
                                else appFile.createFile(contract, "task.out", buf, function (id) {
                                    console.log("Uploaded file ", id.toString(16))
                                })
                            })
                        }
                    })
                }
            })
        })
    })
}

var error_hash = "0x0000000000000000000000000000000000000000000000000000000000000000"

function verifyTask(obj, actor) {
    var filename = obj.filehash + ".wast"
    var ifilename = obj.inputhash + ".bin"
    // store into filesystem
    initTask(filename, obj.file, ifilename, obj.input, function (inithash) {
        if (inithash == obj.init) {
            console.log("Initial hash matches")
        }
        else {
            console.log("Initial hash was wrong")
            return
        }
        taskResult(filename, ifilename, actor, function (res) {
            task_to_steps[obj.id] = res.steps
            if (res.steps < obj.steps) {
                console.log("Too many steps")
                contract.challenge(obj.id, send_opt, function (err, tx) {
                    if (!err) console.log(tx, "challenge initiated")
                })
            }
            // Check if the posted state is a correct intermediate state
            else if (res.steps > obj.steps) {
                console.log("Too few steps")
                getLocation(filename, ifilename, obj.steps, actor, function (hash) {
                    if (hash != obj.hash) contract.challenge(obj.id, send_opt, function (err, tx) {
                        if (!err) console.log(tx, "challenge initiated")
                    })
                    else contract.challengeFinality(obj.id, send_opt, function (err, tx) {
                            if (!err) console.log(tx, "challenge initiated for final state")
                    })
                })
            }
            else if (res.result != obj.hash) {
                console.log("Result mismatch")
                contract.challenge(obj.id, send_opt, function (err, tx) {
                    if (!err) console.log(tx, "challenge initiated")
                })
            }
            else console.log("Seems correct")
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

function getInputFile(filehash, filenum, cont) {
    if (filenum.toNumber() == 0) getFile(filehash, a => cont({data:a, name:filehash}))
    else appFile.getFile(contract, filenum, cont)
}

var task_to_file = {}
var task_to_steps = {}
var task_to_inputfile = {}

// We should listen to contract events

contract.Posted("latest").watch(function (err, ev) {
    if (err) {
        console.log(err)
        return
    }
    var id = ev.args.id.toString()
    task_to_file[id] = ev.args.file + ".wast"
    task_to_inputfile[id] = ev.args.input + ".bin"
    console.log(ev.args)
    io.emit("posted", {giver: ev.args.giver, hash: ev.args.hash, filehash:ev.args.file, inputhash:ev.args.input, inputfile: ev.args.input_file, id:id})
    // download file from IPFS
    getFile(ev.args.file, function (filestr) {
        getInputFile(ev.args.input, ev.args.input_file, function (input) {
/*        getFile(ev.args.input, function (input) { */
            solveTask({giver: ev.args.giver, hash: ev.args.hash, file:filestr, filehash:ev.args.file, id:id, input:input.data, inputhash:input.name}, solver)
        })
    })
})

contract.Solved("latest").watch(function (err, ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("solved", ev.args)
    var id = ev.args.id.toString()
    io.emit("solved", {hash: ev.args.hash, filehash:ev.args.file, init: ev.args.init, id:id, inputhash:ev.args.input, inputfile: ev.args.input_file, steps:ev.args.steps.toString()})
    task_to_file[id] = ev.args.file + ".wast"
    task_to_inputfile[id] = ev.args.input + ".bin"
    getFile(ev.args.file, function (filestr) {
        getInputFile(ev.args.input, ev.args.input_file, function (input) {
            verifyTask({hash: ev.args.hash, file: filestr, filehash:ev.args.file, init: ev.args.init, id:id, input:input.data, inputhash:input.name,
                        steps:ev.args.steps.toString()}, verifier)
        })
    })
})

var challenges = {}

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

function getStep(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-step", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

function getErrorStep(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-error-step", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

function getFinality(fname, ifname, place, actor, cont) {
    var args = insertError(["-m", "-file", ifname, "-final", place, "-case", "0", fname], actor)
    execFile(wasm_path, args, function (error, stdout, stderr) {
        if (error) console.error('stderr', stderr)
        else cont(JSON.parse(stdout))
    })
}

function replyChallenge(id, idx1, idx2) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    var place = Math.floor((idx2-idx1)/2 + idx1)
    if (idx1 + 1 == idx2) {
        // Now we are sending the intermediate states
        getStep(fname, ifname, idx1, solver, function (obj) {
            iactive.postPhases(id, idx1, obj.states, send_opt, function (err,tx) {
                if (err) console.log(err)
                else console.log("Posted phases", tx)
            })
        })
        return
    }
    getLocation(fname, ifname, place, solver, function (hash) {
        iactive.report(id, idx1, idx2, [hash], send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Replied to challenge", tx)
        })
        iactive.report.call(id, idx1, idx2, [hash], send_opt, function (err, res) {
            if (err) console.log(err)
            else console.log("Testing reporting:", res)
        })
    })
}

function replyFinalityChallenge(id, idx1, idx2) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    // Now we are sending the intermediate states
    getFinality(fname, ifname, idx1, solver, function (obj) {
        var vm = obj.vm
        iactive.callFinalityJudge(id, idx1, obj.location,
                           [vm.code, vm.stack, vm.memory, vm.call_stack, vm.globals, vm.calltable, vm.calltypes,
                            vm.input_size, vm.input_name, vm.input_data],
                           [vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize], send_opt, function (err, res) {
            if (err) console.log(err)
            else console.log("Judging (finality) success " + res)
        })
    })
}

function replyPhases(id, idx1, arr) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    // Now we are checking the intermediate states
    getStep(fname, ifname, idx1, verifier, function (obj) {
        for (var i = 1; i < arr.length; i++) {
            if (obj.states[i] != arr[i]) {
                iactive.selectPhase(id, idx1, arr[i-1], i-1, send_opt, function (err,tx) {
                    if (err) console.log(err)
                    else console.log("Selected wrong phase", tx)
                })
                return
            }
        }
    })
}

function replyErrorPhases(id, idx1, arr) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    // Now we are checking the intermediate states
    getErrorStep(fname, ifname, idx1, solver, function (obj) {
        for (var i = 1; i < obj.states.length; i++) {
            if (obj.states[i] != arr[i]) {
                iactive.selectErrorPhase(id, idx1, arr[i-1], i-1, send_opt, function (err,tx) {
                    if (err) console.log(err)
                    else console.log("Selected wrong phase", tx)
                })
                return
            }
        }
        iactive.selectErrorPhase(id, idx1, arr[i-1], i-1, send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Selected wrong phase", tx)
        })
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
    9: "stack_ptr",
    10: "call_ptr",
    11: "memsize",
}

function submitProof(id, idx1, phase) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    // Now we are checking the intermediate states
    getStep(fname, ifname, idx1, solver, function (obj) {
        var proof = obj[phase_table[phase]]
        var merkle = proof.proof || []
        var loc = proof.location || 0
        var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
        if (phase == 5 || phase == 1) m = proof
        var vm = proof.vm || { code: "0x00", stack:"0x00", call_stack:"0x00", calltable:"0x00",
                               globals : "0x00", memory:"0x00", calltypes:"0x00", input_size:"0x00", input_name:"0x00", input_data:"0x00",
                               pc:0, stack_ptr:0, call_ptr:0, memsize:0}
        iactive.callJudge(id, idx1, phase, merkle, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                           [vm.code, vm.stack, vm.memory, vm.call_stack, vm.globals, vm.calltable, vm.calltypes,
                            vm.input_size, vm.input_name, vm.input_data],
                           [vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize], send_opt, function (err, res) {
            if (err) console.log(err)
            else console.log("Judging success " + res)
        })
    })
}

function submitErrorProof(id, idx1, phase) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    // Now we are checking the intermediate states
    getStep(fname, ifname, idx1, verifier, function (obj) {
        var proof = obj[phase_table[phase]]
        var merkle = proof.proof || []
        var loc = proof.location || 0
        var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
        if (phase == 5 || phase == 1) m = proof
        var vm = proof.vm || { code: "0x00", stack:"0x00", call_stack:"0x00", calltable:"0x00",
                               globals : "0x00", memory:"0x00", calltypes:"0x00", input_size:"0x00",input_name:"0x00",input_data:"0x00",
                               pc:0, stack_ptr:0, call_ptr:0, memsize:0}
        iactive.callErrorJudge(id, idx1, phase, merkle, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                           [vm.code, vm.stack, vm.memory, vm.call_stack, vm.globals, vm.calltable, vm.calltypes,
                            vm.input_size, vm.input_name, vm.input_data],
                           [vm.pc, vm.stack_ptr, vm.call_ptr, vm.memsize], send_opt, function (err, res) {
            if (err) console.log(err)
            else console.log("Judging (error) success " + res)
        })
    })
}

function replyReported(id, idx1, idx2, otherhash) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var steps = task_to_steps[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    var place = Math.floor((idx2-idx1)/2 + idx1)
    // Solver has posted too many steps
    if (steps < place) {
        iactive.query(id, idx1, idx2, 0, send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Sent query", tx, " it was ", res)
        })
    }
    else getLocation(fname, ifname, place, verifier, function (hash) {
        var res = hash == otherhash ? 1 : 0
        iactive.query(id, idx1, idx2, res, send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Sent query", tx, " it was ", res)
        })
    })
}

iactive.StartChallenge("latest").watch(function (err,ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("Got challenge")
    console.log(ev)
    io.emit("challenge", {
            prover: ev.args.p,
            challenger: ev.args.c,
            uniq: ev.args.uniq,
            init: ev.args.s,
            result: ev.args.e,
            size: ev.args.par.toNumber(),
        })
    contract.queryChallenge.call(ev.args.uniq, function (err, id) {
        if (err) {
            console.log(err)
            return
        }
        console.log("Got task id ", id)
        var id = id.toString()
        challenges[ev.args.uniq] = {
            prover: ev.args.p,
            task: id,
            challenger: ev.args.c,
            init: ev.args.s,
            result: ev.args.e,
            size: ev.args.par.toNumber(),
        }
        if (ev.args.p == base) replyChallenge(ev.args.uniq, ev.args.idx1.toNumber(), ev.args.idx2.toNumber())
        else console.log("Not for me")
    })
})

iactive.StartFinalityChallenge("latest").watch(function (err,ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("Got finality challenge")
    console.log(ev)
    io.emit("challenge", {
            prover: ev.args.p,
            challenger: ev.args.c,
            uniq: ev.args.uniq,
            init: ev.args.s,
            result: ev.args.e,
        })
    contract.queryChallenge.call(ev.args.uniq, function (err, id) {
        if (err) {
            console.log(err)
            return
        }
        console.log("Got task id ", id)
        var id = id.toString()
        challenges[ev.args.uniq] = {
            prover: ev.args.p,
            task: id,
            challenger: ev.args.c,
            init: ev.args.s,
            result: ev.args.e,
        }
        if (ev.args.p == base) replyFinalityChallenge(ev.args.uniq, ev.args.steps.toNumber())
        else console.log("Not for me")
    })
})

iactive.Reported("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Reported ", ev)
    io.emit("reply", {uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber(), hash:ev.arr[0]})
    replyReported(ev.id, ev.idx1.toNumber(), ev.idx2.toNumber(), ev.arr[0])
})

function postErrorPhases(id, idx1) {
    if (!challenges[id]) {
        console.log("No such task " + id)
        return
    }
    var fname = task_to_file[challenges[id].task]
    var ifname = task_to_inputfile[challenges[id].task]
    // Now we are sending the intermediate states
    getStep(fname, ifname, idx1, verifier, function (obj) {
        iactive.postErrorPhases(id, idx1, obj.states, send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Posted error phases", tx)
        })
    })
}

iactive.NeedErrorPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Query ", ev)
    io.emit("query", {uniq:ev.id, idx1:ev.idx1.toNumber()})
    postErrorPhases(ev.id, ev.idx1.toNumber())
})

iactive.Queried("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Query ", ev)
    io.emit("query", {uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber()})
    replyChallenge(ev.id, ev.idx1.toNumber(), ev.idx2.toNumber())
})

iactive.PostedPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Phases ", ev)
    io.emit("phases", {uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
    replyPhases(ev.id, ev.idx1.toNumber(), ev.arr)
})

iactive.PostedErrorPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Error phases ", ev)
    io.emit("phases", {uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
    replyErrorPhases(ev.id, ev.idx1.toNumber(), ev.arr)
})

iactive.SelectedPhase("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Challenger selected phase ", ev)
    io.emit("phase_selected", {uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
    submitProof(ev.id, ev.idx1.toNumber(), ev.phase.toString())
})

iactive.SelectedErrorPhase("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Prover selected error phase ", ev)
    io.emit("phase_selected", {uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
    submitErrorProof(ev.id, ev.idx1.toNumber(), ev.phase.toString())
})

http.listen(22448, function(){
    console.log("listening on *:22448")
})

