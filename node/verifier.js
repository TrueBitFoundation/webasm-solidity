
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
            // steps = res.steps
            if (res.hash != obj.hash) {
                common.taskResultVM(actor, function (res) {
                    logger.info("Result mismatch")
                    steps = res.steps
                    contract.methods.challenge(obj.id).send(send_opt, function (err, tx) {
                        if (!err) status("Result mismatch, challenge initiated " + tx + " at task " + obj.id)
                    })
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

if (!common.config.events_disabled) {
    iactive.events.Reported(function (err,ev) {
        if (err) return logger.error(err)
        var args = ev.returnValues
        if (challenge_id != args.id) return
        logger.info("Reported ", args)
        replyReported(args.id, parseInt(args.idx1), parseInt(args.idx2), args.arr[0])
    })

    iactive.events.PostedPhases(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (challenge_id != args.id) return
        logger.info("Phases ", args)
        replyPhases(args.id, parseInt(args.idx1), args.arr)
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
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Waiting for solver to post phases", idx)
    }
    else if (state == 4) {
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        var phases = await iactive.methods.getResult(id).call(send_opt)
        logger.info("Posted phases, have to select the wrong one", idx)
        replyPhases(id, getPlace(idx), phases)
    }
    else if (state == 5) {
        var phase = await iactive.methods.getPhase(id).call(send_opt)
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Selected phase %s, waiting for solver", phase)
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
    if (challenge_id) contract.methods.claimDeposit(challenge_id).send(send_opt)
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
