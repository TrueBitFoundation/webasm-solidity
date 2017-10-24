
var fs = require("fs")
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract

// Now the file names do not have to be special

function giveTask(taskfile, inputfile) {
    var task = fs.readFileSync(taskfile)
    var input = fs.readFileSync(inputfile)
    var input_buffer = appFile.inputToBuffer(input)
    ipfs.files.add([task, input_buffer], function (err, res) {
            if (err) {
                console.log(err)
                return
            }
            console.log(res)
            // store into filesystem
            common.initTask(taskfile, task, inputfile, input_buffer, function (state) {
                contract.add(state, res[0].hash, res[1].hash, send_opt, function (err, tr) {
                    if (err) console.log(err)
                    else {
                        console.log("Success", tr)
                        // io.emit("task_success", tr)
                    }
                })
            })
    })
}

giveTask("task.wast", "input.bin")

