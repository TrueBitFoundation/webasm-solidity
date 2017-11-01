
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

var task_id, steps

function status(msg) {
    config.message = msg
    socket.emit("config", config)
    logger.info(msg)
}

function solveTask(obj, config) {
    // store into filesystem
    common.initTask(config).then(function (inithash) {
        if (inithash == obj.hash) {
            status("Initial hash was correct, now solving.")
        }
        else {
            status("Initial hash was wrong, exiting.")
            return
            // process.exit(0)
        }

        common.taskResult(config, function (res) {
            steps = res.steps
            contract.methods.solve(obj.id, res.hash).send(send_opt, function (err, tr) {
                if (err) logger.error(err)
                else {
                    status("Solved task " + tr)
                    fs.access(dir+"/blockchain.out", fs.constants.R_OK, function (err) {
                        if (!err) {
                            fs.readFile(dir+"/blockchain.out", function (err, buf) {
                                if (err) logger.error(err)
                                else appFile.createFile(contract, "task.out", buf, function (id) {
                                    status("Uploaded file " + id.toString(16))
                                    contract.methods.getRoot(id).call(function (err,res) {
                                        logger.info("Output file root", res)
                                    })
                                    common.ensureOutputFile(config, function (proof) {
                                        contract.methods.finalize(obj.id, id, common.getRoots(proof.vm), common.getPointers(proof.vm),
                                                          proof.loc.list, proof.loc.location).send(send_opt, function (err, res) {
                                            logger.info("finalized task", err, res)
                                        })
                                    })
                                })
                            })
                        }
                    })
                }
            })
        })
    })
}

function replyChallenge(id, idx1, idx2) {
    var place = Math.floor((idx2-idx1)/2 + idx1)
    if (idx1 + 1 == idx2) {
        // Now we are sending the intermediate states
        common.getStep(idx1, config, function (obj) {
            iactive.methods.postPhases(id, idx1, obj.states).send(send_opt, function (err,tx) {
                if (err) logger.error(err)
                else {
                    status("Posted phases " + tx)
                }
            })
        })
        return
    }
    common.getLocation(place, config, function (hash) {
        iactive.methods.report(id, idx1, idx2, [hash]).send(send_opt, function (err,tx) {
            if (err) logger.error(err)
            else {
                status("Replied place " + place + " for challenge " + tx)
            }
        })
    })
}

function replyFinalityChallenge(id, idx1, idx2) {
    // Now we are sending the intermediate states
    common.getFinality(idx1, config, function (obj) {
        iactive.methods.callFinalityJudge(id, idx1, obj.location,
                           common.getRoots(obj.vm), common.getPointers(obj.vm)).send(send_opt, function (err, res) {
            if (err) logger.error(err)
            else status("Judging finality " + res)
        })
    })
}

function replyErrorPhases(id, idx1, arr) {
    // Now we are checking the intermediate states
    common.getErrorStep(idx1, config, function (obj) {
        for (var i = 1; i < obj.states.length; i++) {
            if (obj.states[i] != arr[i]) {
                iactive.methods.selectErrorPhase(id, idx1, arr[i-1], i-1).send(send_opt, function (err,tx) {
                    if (err) logger.error(err)
                    else status("Selected wrong phase " + tx)
                })
                return
            }
        }
        iactive.methods.selectErrorPhase(id, idx1, arr[i-1], i-1).send(send_opt, function (err,tx) {
            if (err) logger.error(err)
            else status("Selected wrong error phase " + tx)
        })
    })
}


function submitProof(id, idx1, phase) {
    // Now we are checking the intermediate states
    common.getStep(idx1, config, function (obj) {
        var proof = obj[common.phase_table[phase]]
        var merkle = proof.proof || []
        var loc = proof.location || 0
        var m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
        if (phase == 5 || phase == 1) m = proof
        var vm 
        if (typeof proof.vm != "object") vm = { code: "0x00", stack:"0x00", call_stack:"0x00", calltable:"0x00",
                               globals : "0x00", memory:"0x00", calltypes:"0x00", input_size:"0x00", input_name:"0x00", input_data:"0x00",
                               pc:0, stack_ptr:0, call_ptr:0, memsize:0}
        else vm = proof.vm
        logger.info("calling judge", {id:id, idx1:idx1, phase:phase, merkle: merkle, vm:m.vm, op:m.op, regs:[m.reg1, m.reg2, m.reg3, m.ireg],
                                     roots:common.getRoots(vm), pointers: common.getPointers(vm), proof:proof})
        iactive.methods.callJudge(id, idx1, phase, merkle, m.vm, m.op, [m.reg1, m.reg2, m.reg3, m.ireg],
                           common.getRoots(vm), common.getPointers(vm)).send(send_opt, function (err, res) {
            if (err) logger.error(err)
            else status("Judging " + res)
        })
    })
}

var challenges = {}


function myId(ev) {
    return !!challenges[ev.returnValues.id]
}

async function initChallenge(id) {
    var stdout1 = await common.exec(config, ["-m", "-input"])
    var obj1 = JSON.parse(stdout1)
    var stdout2 = await common.exec(config, ["-m", "-output"])
    var obj2 = JSON.parse(stdout2)
    var steps = obj2.steps
    iactive.methods.initialize(id, common.getRoots(obj1.vm), common.getPointers(obj1.vm), steps,
                                common.getRoots(obj2.vm), common.getPointers(obj2.vm)).send(send_opt, function (err,tx) {
        if (err) return logger.error(err);
        status("Initialized challenge " + tx)
        replyChallenge(id, 0, steps-1)
    })
}

if (!common.config.events_disabled) {
    
    iactive.events.StartChallenge(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (args.p.toLowerCase() != base) return
        logger.error("Got challenge", ev)
        contract.methods.queryChallenge(args.uniq).call(function (err, id) {
            if (err) {
                logger.error(err)
                return
            }
            logger.info("Got task id ", id)
            var id = parseInt(id)
            if (task_id != id) return
            challenges[args.uniq] = {
                prover: args.p,
                task: id,
                challenger: args.c,
                init: args.s,
                result: args.e,
                size: parseInt(args.par),
            }
            // replyChallenge(args.uniq, parseInt(args.idx1), parseInt(args.idx2))
            initChallenge(args.uniq)
        })
    })

    iactive.events.StartFinalityChallenge(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (args.p.toLowerCase() != base) return
        logger.info("Got finality challenge", args)
        contract.methods.queryChallenge(args.uniq).call(function (err, id) {
            if (err) return logger.error(err)
            logger.info("Got task id ", id)
            var id = parseInt(id)
            if (task_id != id) return
            logger.info("Challenge to us")
            challenges[args.uniq] = {
                prover: args.p,
                task: id,
                challenger: args.c,
                init: args.s,
                result: args.e,
            }
            replyFinalityChallenge(args.uniq, parseInt(args.step))
        })
    })

    iactive.events.Queried(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (!myId(ev)) return
        logger.info("Query ", args)
        replyChallenge(args.id, parseInt(args.idx1), parseInt(args.idx2))
    })

    iactive.events.PostedErrorPhases(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (!myId(ev)) return
        logger.info("Error phases ", args)
        replyErrorPhases(args.id, parseInt(args.idx1), args.arr)
    })

    iactive.events.SelectedPhase(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (!myId(ev)) return
        logger.info("Challenger selected phase ", args)
        submitProof(args.id, parseInt(args.idx1), args.phase)
    })

    iactive.events.WinnerSelected(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (!myId(ev)) return
        iactive.methods.isRejected(task_id).call(send_opt, function (err, res) {
            if (err) return logger.error(err)
            if (!res) return status("A challenge was rejected")
            status("My solution was rejected, exiting.")
            cleanup()
        })
            })

    contract.events.Finalized(function (err,ev) {
        if (err) return logger.error(err);
        var args = ev.returnValues
        if (task_id.toString() != args.id) return
        status("Task accepted, exiting.")
        cleanup()
    })
}

async function checkChallenge(id) {
    var state = await iactive.methods.getState(id).call(send_opt)
    logger.info("Challenge %s is in state %d", id, state)
    if (state == 0) {
        logger.info("Not yet initialized")
        initChallenge(id)
    }
    else if (state == 1) {
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Running at", idx)
        var state = await iactive.methods.getStateAt(id, getPlace(idx)).call(send_opt)
        if (parseInt(state) == 0) {
            replyChallenge(id, parseInt(idx.idx1), parseInt(idx.idx2))
        }
        else logger.info("Waiting if challenger will reply")
    }
    else if (state == 2) {
        logger.info("Winner %s", await iactive.methods.getWinner(id).call(send_opt))
    }
    else if (state == 3) {
        // NeedErrorPhases
    }
    else if (state == 4) {
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Need phases for state", idx)
        replyChallenge(id, parseInt(idx.idx1), parseInt(idx.idx2))
    }
    else if (state == 5) {
        // PostedErrorPhases,
    }
    else if (state == 6) {
        logger.info("Posted phases, waiting for challenger", await iactive.methods.getIndices(id).call(send_opt))
    }
    else if (state == 7) {
        // SelectedErrorPhase,
    }
    else if (state == 8) {
        var phase = await iactive.methods.getPhase(id).call(send_opt)
        var idx = await iactive.methods.getIndices(id).call(send_opt)
        logger.info("Selected phase %s", phase)
        submitProof(id, getPlace(idx), phase)
    }
    else if (state == 9) {
        /* Special states for finality */
        logger.info("This was a challenge for finality of the end state")
    }
}

async function checkState() {
    // Using task id, get all challengers
    var lst = await contract.methods.getChallenges(task_id).call(send_opt)
    logger.info("Current challengers for task %d", task_id, {lst:lst})
    lst.forEach(checkChallenge)
}

async function forceTimeout() {
    if (!config) return
    if (common.config.poll) checkState()
    var good = await contract.methods.finalizeTask(task_id).call(send_opt)
    logger.info("Testing timeout", {good:good})
    if (good == true) contract.methods.finalizeTask(task_id).send(send_opt, function (err,tx) {
        if (err) return console.error(err)
        status("Trying timeout " + tx)
    })
}

var ival = setInterval(forceTimeout, common.config.timeout)

function cleanup() {
    clearInterval(ival)
}

async function runSolver() {
    // download file from IPFS
    logger.info("solving", config)
    task_id = parseInt(config.id)
    config.pid = Math.floor(Math.random()*10000)
    config.kind = "solver"
    config.input_file = "input.bin"
    config.code_file = "task." + common.getExtension(config.code_type)
    config.log_file = common.log_file
    socket.emit("config", config)
    config.files = []
    config.vm_parameters = await contract.methods.getVMParameters(task_id).call(send_opt)
    var solver = contract.methods.getSolver(task_id).call()
    if (parseInt(solver)) return logger.error("Already solved", {solver:solver})
    common.getStorage(config, function () {
        solveTask({giver: config.giver, hash: config.init, id:task_id}, config)
    })
    /*
    common.getFile(config.filehash, config.code_storage, function (filestr) {
        common.getAndEnsureInputFile(config, config.inputhash, config.inputfile, filestr, task_id, function (input) {
            solveTask({giver: config.giver, hash: config.hash, file:filestr, filehash:config.filehash, id:task_id, input:input.data, inputhash:input.name}, config)
        })
    })*/
}

runSolver()

}
