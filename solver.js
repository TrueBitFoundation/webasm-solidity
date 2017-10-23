
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt

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
            // return
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
                                    contract.getRoot.call(id, function (err,res) {
                                        console.log("output file root", res)
                                    })
                                    ensureOutputFile(filename, ifilename, actor, function (proof) {
                                        contract.finalize(obj.id, id, getRoots(proof.vm), getPointers(proof.vm), proof.loc.list, proof.loc.location, send_opt, function (err, res) {
                                            console.log("finalized task", err, res)
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


iactive.Queried("latest").watch(function (err,ev) {
    if (err) { console.log(err) ; return }
    ev = ev.args
    console.log("Query ", ev)
    io.emit("query", {uniq:ev.id, idx1:ev.idx1.toNumber(), idx2:ev.idx2.toNumber()})
    replyChallenge(ev.id, ev.idx1.toNumber(), ev.idx2.toNumber())
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

function runSolver(config) {
    // download file from IPFS
    common.getFile(config.file, function (filestr) {
        common.getAndEnsureInputFile(config.input, config.input_file, config.file, filestr, id, function (input) {
            solveTask({giver: config.giver, hash: config.hash, file:filestr, filehash:ev.args.file, id:id, input:input.data, inputhash:input.name}, solver)
        })
    })
}

runSolver(fs.readFileSync("solver.json"))

