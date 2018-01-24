
var fs = require("fs")

exports.make = function (dir, config) {

var common = require("./common").make(dir)
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract
var iactive = common.iactive
var base = common.base
var logger = common.logger

var getPlace = common.getPlace

var socket = require('socket.io-client')('http://localhost:22448')

var task_id, verifier, steps, challenge_id

var error_hash = "0x0000000000000000000000000000000000000000000000000000000000000000"

function status(msg) {
    config.message = msg
    socket.emit("config", config)
    logger.info(msg)
}

function verifyTask(obj, actor) {
    // store into filesystem
    logger.info("verifying task", obj)
    common.initTask(actor).then(function (inithash) {
        if (inithash == obj.init) logger.info("Initial hash matches")
        else {
            status("Initial hash was wrong, exiting.")
            process.exit(0)
            return
        }
        common.taskResult(actor, function (res) {
            /* steps = res.steps
            if (res.steps < obj.steps) {
                logger.error("Too many steps")
                contract.methods.challenge(obj.id).send(send_opt, function (err, tx) {
                    if (!err) status("Too many steps, challenge initiated " + tx)
                })
            }
            // Check if the posted state is a correct intermediate state
            else if (res.steps > obj.steps) {
                logger.error("Too few steps")
                common.getLocation(obj.steps, actor, function (hash) {
                    if (hash != obj.hash) contract.methods.challenge(obj.id).send(send_opt, function (err, tx) {
                        if (!err) status("Too few steps, challenge initiated " + tx)
                    })
                    else contract.methods.challengeFinality(obj.id).send(send_opt, function (err, tx) {
                        if (!err) status("Not a final state, challenge initiated " + tx)
                    })
                })
            }
            else */
            steps = res.steps
            if (res.hash != obj.hash) {
                logger.info("Result mismatch")
                contract.methods.challenge(obj.id).send(send_opt, function (err, tx) {
                    if (!err) status("Result mismatch, challenge initiated " + tx + " at task " + obj.id)
                })
            }
            else {
                status("Result correct, exiting")
                cleanup()
            }
        })
    })
}

function replyPhases(id, idx1, arr) {
    // Now we are checking the intermediate states
    common.getStep(idx1, verifier, function (obj) {
        for (var i = 1; i < arr.length; i++) {
            if (obj.states[i] != arr[i]) {
                iactive.methods.selectPhase(id, idx1, arr[i-1], i-1).send(send_opt, function (err,tx) {
                    if (err) logger.error(err)
                    else status("Selected phase " + tx)
                })
                return
            }
        }
    })
}

function submitErrorProof(id, idx1, phase) {
    // Now we are checking the intermediate states
    common.getStep(idx1, verifier, function (obj) {
        var proof = obj[phase_table[phase]]
        var merkle = proof.location || []
        var merkle2 = []
        if (proof.merkle) {
            merkle = proof.merkle.list || proof.merkle.list1 || []
            merkle2 = proof.merkle.list2 || []
        }
        var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
        if (phase == 5 || phase == 1) m = proof
        if (typeof proof.vm != "object") vm = { code: "0x00", stack:"0x00", call_stack:"0x00", calltable:"0x00",
                               globals : "0x00", memory:"0x00", calltypes:"0x00", input_size:"0x00", input_name:"0x00", input_data:"0x00",
                               pc:0, stack_ptr:0, call_ptr:0, memsize:0}
        else vm = proof.vm
        iactive.methods.callErrorJudge(id, idx1, phase, merkle, merkle2, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                           common.getRoots(vm), common.getPointers(vm)).send(send_opt, function (err, res) {
            if (err) logger.error(err)
            else status("Judging error " + res)
        })
    })
}

function replyReported(id, idx1, idx2, otherhash) {
    var place = Math.floor((idx2-idx1)/2 + idx1)
    logger.info("place", place, "steps", steps)
    // Solver has posted too many steps
    if (steps < place) {
        iactive.methods.query(id, idx1, idx2, 0).send(send_opt, function (err,tx) {
            if (err) logger.error(err)
            else status("Sent query " + tx + " for towards " + idx1 + " from " + place)
        })
    }
    else common.getLocation(place, verifier, function (hash) {
        var res = hash == otherhash ? 1 : 0
        iactive.methods.query(id, idx1, idx2, res).send(send_opt, function (err,tx) {
            if (err) logger.error(err)
            else status("Sent query " + tx + " for towards " + (res?idx2:idx1) + " from " + place)
        })
    })
}

function postErrorPhases(id, idx1) {
    // Now we are sending the intermediate states
    getStep(idx1, verifier, function (obj) {
        iactive.methods.postErrorPhases(id, idx1, obj.states).send(send_opt, function (err,tx) {
            if (err) logger.error(err)
            else status("Posted error phases " + tx)
        })
    })
}

if (!common.config.events_disabled) {
    iactive.events.Reported(function (err,ev) {
        if (err) return logger.error(err)
        var args = ev.returnValues
        if (challenge_id != args.id) return
        logger.info("Reported ", args)
        replyReported(args.id, parseInt(args.idx1), parseInt(args.idx2), args.arr[0])
    })

    iactive.events.NeedErrorPhases(function (err,ev) {
        if (err) return logger.error(err)
        var args = ev.returnValues
        if (challenge_id != args.id) return
        logger.info("Query ", args)
        postErrorPhases(args.id, parseInt(args.idx1))
    })

    iactive.events.PostedPhases(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (challenge_id != args.id) return
        logger.info("Phases ", args)
        replyPhases(args.id, parseInt(args.idx1), args.arr)
    })

    iactive.events.SelectedErrorPhase(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (challenge_id != args.id) return
        logger.info("Prover selected error phase ", args)
        submitErrorProof(args.id, parseInt(args.idx1), args.phase)
    })

    iactive.events.StartChallenge(function (err,ev) {
        if (err) return logger.error(err)
        var args = ev.returnValues
        logger.info("Got challenge", args)
        if (args.c.toLowerCase() != base) return
        logger.info("Got challenge to our address", args)
        contract.methods.queryChallenge(args.uniq).call(function (err, id) {
            if (err) return logger.error(err)
            logger.info("Got task id ", id)
            var id = parseInt(id.toString())
            if (task_id != id) return
            challenge_id = args.uniq
            logger.info("Got challenge that we are handling", ev)
            status("Got challenge id")
        })
    })

    iactive.events.StartFinalityChallenge(function (err,ev) {
        if (err) return logger.error(err)
        var args = ev.returnValues
        logger.info("Got finality challenge", args)
        if (args.c.toLowerCase() != base) return
        contract.methods.queryChallenge(args.uniq).call(function (err, id) {
            if (err) return logger.error(err)
            logger.info("Got task id %s", id)
            var id = parseInt(id.toString())
            if (task_id != id) return
            challenge_id = args.uniq
            status("Got challenge id")
        })
            })

    iactive.events.WinnerSelected(function (err,ev) {
        if (err) return logger.error(err)
        var args = ev.returnValues
        if (challenge_id != args.id) return
        status("Selected winner for challenge, exiting.")
        cleanup()
    })
}

async function checkChallenge(id) {
    var state = await iactive.methods.getState(id).call(send_opt)
    logger.info("Challenge %s is in state %d", id, state)
    if (state == 0) {
        logger.info("Not yet initialized")
    }
    else if (state == 1) {
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Running at", idx)
        var state = await iactive.methods.getStateAt(id, getPlace(idx)).call(send_opt)
        if (parseInt(state) == 0) {
            logger.info("No state posted yet, waiting")
        }
        else {
            logger.info("Doing query")
            replyReported(id, parseInt(idx.idx1), parseInt(idx.idx2), state)
        }
    }
    else if (state == 2) {
        logger.info("Winner %s", await iactive.methods.getWinner(id).call(send_opt))
    }
    else if (state == 3) {
        // NeedErrorPhases
    }
    else if (state == 4) {
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Waiting for solver to post phases", idx)
    }
    else if (state == 5) {
        // PostedErrorPhases,
    }
    else if (state == 6) {
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        var phases = await iactive.methods.getResult(id).call(send_opt)
        logger.info("Posted phases, have to select the wrong one", idx)
        replyPhases(id, getPlace(idx), phases)
    }
    else if (state == 7) {
        // SelectedErrorPhase,
    }
    else if (state == 8) {
        var phase = await iactive.methods.getPhase(id).call(send_opt)
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Selected phase %s, waiting for solver", phase)
    }
    else if (state == 9) {
        /* Special states for finality */
        logger.info("This was a challenge for finality of the end state")
    }
}

async function testChallenge(id) {
    var addr = await iactive.methods.getChallenger(id).call(send_opt)
    if (addr.toLowerCase() != base) return
    logger.info("Found my challenge ID %s", id)
    challenge_id = id
}

async function checkForChallenge() {
    // Using task id, get all challengers
    if (!common.config.poll) return
    var lst = await contract.methods.getChallenges(task_id).call(send_opt)
    logger.info("Current challenges", {lst:lst})
    lst.forEach(testChallenge)
}

async function forceTimeout() {
    if (!challenge_id) return checkForChallenge()
    if (common.config.poll) checkChallenge(challenge_id)
    var good = await iactive.methods.gameOver(challenge_id).call(send_opt)
    logger.info("Testing timeout", good)
    if (good == true) iactive.methods.gameOver(challenge_id).send(send_opt, function (err,tx) {
        if (err) return console.error(err)
        status("Trying timeout " + tx)
    })
}

var ival = setInterval(forceTimeout, common.config.timeout)

function cleanup() {
    clearInterval(ival)
}

async function runVerifier() {
    logger.info("verifying", config)
    task_id = parseInt(config.id)
    verifier = config
    config.pid = Math.floor(Math.random()*10000)
    config.kind = "verifier"
    config.log_file = common.log_file
    socket.emit("config", config)
    // config.input_file = "input.bin"
    config.files = []
    config.code_file = "task." + common.getExtension(config.code_type)
    config.vm_parameters = await contract.methods.getVMParameters(task_id).call(send_opt)
    common.getStorage(config, function () {
        verifyTask({init: config.init, hash: config.hash, id:task_id}, config)
    })
}

runVerifier()

}
