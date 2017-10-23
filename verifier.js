
var fs = require("fs")
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract
var iactive = common.iactive
var base = common.base

var task_id, verifier, steps, challenge_id

var error_hash = "0x0000000000000000000000000000000000000000000000000000000000000000"

function verifyTask(obj, actor) {
    // store into filesystem
    common.initTask("task.wast", obj.file, "input.bin", obj.input, function (inithash) {
        if (inithash == obj.init) {
            console.log("Initial hash matches")
        }
        else {
            console.log("Initial hash was wrong")
            return
        }
        common.taskResult("task.wast", "input.bin", actor, function (res) {
            steps = res.steps
            if (res.steps < obj.steps) {
                console.log("Too many steps")
                contract.challenge(obj.id, send_opt, function (err, tx) {
                    if (!err) console.log(tx, "challenge initiated")
                })
            }
            // Check if the posted state is a correct intermediate state
            else if (res.steps > obj.steps) {
                console.log("Too few steps")
                common.getLocation("task.wast", "input.bin", obj.steps, actor, function (hash) {
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
            else {
                console.log("Seems correct")
                process.exit(0)
            }
        })
    })
}

function replyPhases(idx1, arr) {
    // Now we are checking the intermediate states
    common.getStep("task.wast", "input.bin", idx1, verifier, function (obj) {
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

function submitErrorProof(idx1, phase) {
    // Now we are checking the intermediate states
    common.getStep("task.wast", "input.bin", idx1, verifier, function (obj) {
        var proof = obj[phase_table[phase]]
        var merkle = proof.proof || []
        var loc = proof.location || 0
        var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
        if (phase == 5 || phase == 1) m = proof
        var vm = proof.vm || { code: "0x00", stack:"0x00", call_stack:"0x00", calltable:"0x00",
                               globals : "0x00", memory:"0x00", calltypes:"0x00", input_size:"0x00",input_name:"0x00",input_data:"0x00",
                               pc:0, stack_ptr:0, call_ptr:0, memsize:0}
        iactive.callErrorJudge(id, idx1, phase, merkle, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                           common.getRoots(), common.getPointers(), send_opt, function (err, res) {
            if (err) console.log(err)
            else console.log("Judging (error) success " + res)
        })
    })
}

function replyReported(idx1, idx2, otherhash) {
    var place = Math.floor((idx2-idx1)/2 + idx1)
    // Solver has posted too many steps
    if (steps < place) {
        iactive.query(id, idx1, idx2, 0, send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Sent query", tx, " it was ", res)
        })
    }
    else common.getLocation("task.wast", "input.bin", place, verifier, function (hash) {
        var res = hash == otherhash ? 1 : 0
        iactive.query(id, idx1, idx2, res, send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Sent query", tx, " it was ", res)
        })
    })
}

function postErrorPhases(id, idx1) {
    // Now we are sending the intermediate states
    getStep("task.wast", "input.bin", idx1, verifier, function (obj) {
        iactive.postErrorPhases(id, idx1, obj.states, send_opt, function (err,tx) {
            if (err) console.log(err)
            else console.log("Posted error phases", tx)
        })
    })
}

iactive.Reported("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    console.log("Reported ", ev)
    // io.emit("reply", {uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber(), hash:ev.arr[0]})
    replyReported(ev.id, ev.idx1.toNumber(), ev.idx2.toNumber(), ev.arr[0])
})

iactive.NeedErrorPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    console.log("Query ", ev)
    // io.emit("query", {uniq:ev.id, idx1:ev.idx1.toNumber()})
    postErrorPhases(ev.id, ev.idx1.toNumber())
})

iactive.PostedPhases("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    console.log("Phases ", ev)
    // io.emit("phases", {uniq:ev.id, idx1:ev.idx1.toNumber(), phases:ev.arr})
    replyPhases(ev.id, ev.idx1.toNumber(), ev.arr)
})


iactive.SelectedErrorPhase("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    console.log("Prover selected error phase ", ev)
    // io.emit("phase_selected", {uniq:ev.id, idx1:ev.idx1.toNumber(), phase:ev.phase.toString()})
    submitErrorProof(ev.idx1.toNumber(), ev.phase.toString())
})

iactive.StartChallenge("latest").watch(function (err,ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("Got challenge", ev)
    if (ev.args.c == base) challenge_id = ev.args.uniq
})

iactive.StartFinalityChallenge("latest").watch(function (err,ev) {
    if (err) {
        console.log(err)
        return
    }
    console.log("Got finality challenge", ev)
    if (ev.args.c == base) challenge_id = ev.args.uniq
})


function runVerifier(config) {
    console.log("verifying", config)
    task_id = parseInt(config.id, 16)
    verifier = config.actor
    common.getFile(config.filehash, function (filestr) {
        common.getInputFile(config.inputhash, config.inputfile, function (input) {
            verifyTask({hash: config.hash, file: filestr, filehash:config.filehash, init: config.init, id:task_id, input:input.data, inputhash:input.name,
                        steps:config.steps}, verifier)
        })
    })
}

runVerifier(JSON.parse(fs.readFileSync("verifier.json")))


