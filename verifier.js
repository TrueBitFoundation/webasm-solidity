
var fs = require("fs")
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract
var iactive = common.iactive
var base = common.base
var logger = common.logger

var socket = require('socket.io-client')('http://localhost:22448')

var task_id, verifier, steps, challenge_id

var error_hash = "0x0000000000000000000000000000000000000000000000000000000000000000"

var config

function status(msg) {
    config.message = msg
    socket.emit("config", config)
    logger.info(msg)
}

function verifyTask(obj, actor) {
    // store into filesystem
    common.initTask("task.wast", obj.file, "input.bin", obj.input, function (inithash) {
        if (inithash == obj.init) {
            logger.info("Initial hash matches")
        }
        else {
            logger.error("Initial hash was wrong")
            config.message = "Initial hash was wrong, exiting."
            socket.emit("config", config)
            process.exit(0)
            return
        }
        common.taskResult("task.wast", "input.bin", actor, function (res) {
            steps = res.steps
            if (res.steps < obj.steps) {
                logger.error("Too many steps")
                contract.challenge(obj.id, send_opt, function (err, tx) {
                    if (!err) {
                        logger.info(tx, "challenge initiated")
                        config.message = "Too many steps, challenge initiated " + tx
                        socket.emit("config", config)
                    }
                })
            }
            // Check if the posted state is a correct intermediate state
            else if (res.steps > obj.steps) {
                logger.error("Too few steps")
                common.getLocation("task.wast", "input.bin", obj.steps, actor, function (hash) {
                    if (hash != obj.hash) contract.challenge(obj.id, send_opt, function (err, tx) {
                        if (!err) {
                            logger.info(tx, "challenge initiated")
                            config.message = "Too few steps, challenge initiated " + tx
                            socket.emit("config", config)
                        }
                    })
                    else contract.challengeFinality(obj.id, send_opt, function (err, tx) {
                        if (!err) {
                            logger.info(tx, "challenge initiated for final state")
                            config.message = "Not a final state, challenge initiated " + tx
                            socket.emit("config", config)
                        }
                    })
                })
            }
            else if (res.result != obj.hash) {
                logger.info("Result mismatch")
                contract.challenge(obj.id, send_opt, function (err, tx) {
                    if (!err) {
                        logger.info(tx, "challenge initiated")
                        config.message = "Result mismatch, challenge initiated " + tx
                        socket.emit("config", config)
                    }
                })
            }
            else {
                logger.info("Seems correct")
                config.message = "Result correct, exiting" 
                socket.emit("config", config)
                process.exit(0)
            }
        })
    })
}

function replyPhases(id, idx1, arr) {
    // Now we are checking the intermediate states
    common.getStep("task.wast", "input.bin", idx1, verifier, function (obj) {
        for (var i = 1; i < arr.length; i++) {
            if (obj.states[i] != arr[i]) {
                iactive.selectPhase(id, idx1, arr[i-1], i-1, send_opt, function (err,tx) {
                    if (err) logger.error(err)
                    else {
                        logger.info("Selected wrong phase", tx)
                        config.message = "Selected phase " + tx
                        socket.emit("config", config)
                    }
                })
                return
            }
        }
    })
}

function submitErrorProof(id, idx1, phase) {
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
            if (err) logger.error(err)
            else {
                logger.info("Judging (error) success " + res)
                config.message = "Judging error " + res
                socket.emit("config", config)
            }
        })
    })
}

function replyReported(id, idx1, idx2, otherhash) {
    var place = Math.floor((idx2-idx1)/2 + idx1)
    logger.info("place", place, "steps", steps)
    // process.exit(0)
    // Solver has posted too many steps
    if (steps < place) {
        iactive.query(id, idx1, idx2, 0, send_opt, function (err,tx) {
            if (err) logger.error(err)
            else {
                logger.info("Sent query", tx, " it was ", res)
                config.message = "Sent query " + tx + " for position " + res
                socket.emit("config", config)
            }
        })
    }
    else common.getLocation("task.wast", "input.bin", place, verifier, function (hash) {
        var res = hash == otherhash ? 1 : 0
        iactive.query(id, idx1, idx2, res, send_opt, function (err,tx) {
            if (err) logger.error(err)
            else {
                logger.info("Sent query", tx, " it was ", res)
                config.message = "Sent query " + tx + " for position " + res
                socket.emit("config", config)
            }
        })
    })
}

function postErrorPhases(id, idx1) {
    // Now we are sending the intermediate states
    getStep("task.wast", "input.bin", idx1, verifier, function (obj) {
        iactive.postErrorPhases(id, idx1, obj.states, send_opt, function (err,tx) {
            if (err) logger.error(err)
            else {
                logger.info("Posted error phases", tx)
                config.message = "Posted error phases " + tx
                socket.emit("config", config)
            }
        })
    })
}

iactive.Reported("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    logger.info("Reported ", ev)
    replyReported(ev.id, ev.idx1.toNumber(), ev.idx2.toNumber(), ev.arr[0])
})

iactive.NeedErrorPhases("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    logger.info("Query ", ev)
    postErrorPhases(ev.id, ev.idx1.toNumber())
})

iactive.PostedPhases("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    logger.info("Phases ", ev)
    replyPhases(ev.id, ev.idx1.toNumber(), ev.arr)
})


iactive.SelectedErrorPhase("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    logger.info("Prover selected error phase ", ev)
    submitErrorProof(ev.id, ev.idx1.toNumber(), ev.phase.toString())
})

iactive.StartChallenge("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    logger.info("Got challenge", ev)
    if (ev.args.c != base) return
    logger.info("Got challenge to our address", ev)
    contract.queryChallenge.call(ev.args.uniq, function (err, id) {
        if (err) { logger.error(err) ; return }
        logger.info("Got task id ", id)
        var id = parseInt(id.toString(16),16)
        if (task_id != id) return
        challenge_id = ev.args.uniq
        logger.info("Got challenge that we are handling", ev)
        config.message = "Got challenge id"
        socket.emit("config", config)
    })
})

iactive.StartFinalityChallenge("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    logger.info("Got finality challenge", ev)
    if (ev.args.c != base) return
    contract.queryChallenge.call(ev.args.uniq, function (err, id) {
        if (err) { logger.error(err) ; return }
        logger.info("Got task id %s", id)
        var id = parseInt(id.toString(16),16)
        if (task_id != id) return
        challenge_id = ev.args.uniq
        config.message = "Got challenge id"
        socket.emit("config", config)
    })
})

iactive.WinnerSelected("latest").watch(function (err,ev) {
    if (err) { logger.error(err) ; return }
    ev = ev.args
    if (challenge_id != ev.id.toString(16)) return
    status("Selected winner for challenge, exiting.")
    process.exit(0)
})

function forceTimeout() {
    if (!challenge_id) return
    iactive.gameOver(challenge_id, send_opt, function (err,tx) {
        if (err) return console.error(err)
        status("Trying timeout " + tx)
    })
}

setInterval(forceTimeout, 10000)

function runVerifier(congif) {
    config = congif
    logger.info("verifying", config)
    task_id = parseInt(config.id, 16)
    verifier = config.actor
    config.pid = process.pid
    config.kind = "verifier"
    socket.emit("config", config)
    common.getFile(config.filehash, function (filestr) {
        common.getInputFile(config.inputhash, config.inputfile, function (input) {
            verifyTask({hash: config.hash, file: filestr, filehash:config.filehash, init: config.init, id:task_id, input:input.data, inputhash:input.name,
                        steps:config.steps}, verifier)
        })
    })
}

runVerifier(JSON.parse(fs.readFileSync("verifier.json")))


