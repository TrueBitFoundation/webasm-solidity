
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt

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

iactive.PostedPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Phases ", ev)
    io.emit("phases", {uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
    replyPhases(ev.id, ev.idx1.toNumber(), ev.arr)
})


iactive.SelectedErrorPhase("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Prover selected error phase ", ev)
    io.emit("phase_selected", {uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
    submitErrorProof(ev.id, ev.idx1.toNumber(), ev.phase.toString())
})

function runVerifier(config) {
    console.log("solved", ev.args)
    var id = config.toString()
    common.getFile(config.file, function (filestr) {
        getInputFile(config.input, config.input_file, function (input) {
            verifyTask({hash: config.hash, file: filestr, filehash:config.file, init: config.init, id:id, input:input.data, inputhash:input.name,
                        steps:config.steps}, verifier)
        })
    })
}

runVerifier(fs.readFileSync("verifier.json"))


