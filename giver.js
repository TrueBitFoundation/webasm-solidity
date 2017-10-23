
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs

function giveTask() {
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
            common.initTask(filename, obj.task, inputfilename, input_buffer, function (state) {
                contract.add(state, res[0].hash, res[1].hash, send_opt, function (err, tr) {
                    if (err) console.log(err)
                    else {
                        console.log("Success", tr)
                        io.emit("task_success", tr)
                    }
                })
            })
        })
}


