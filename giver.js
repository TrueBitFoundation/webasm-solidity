
var fs = require("fs")
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract

// Now the file names do not have to be special

function giveTask(obj) {
    var task = fs.readFileSync(obj.taskfile)
    var input = fs.readFileSync(obj.inputfile)
    var input_buffer = appFile.inputToBuffer(input)
    obj.code_file = obj.taskfile
    obj.input_file = obj.inputfile
    obj.actor = {}
    ipfs.files.add([task, input_buffer], function (err, res) {
            if (err) return console.log(err)
            console.log(res)
            // store into filesystem
            common.initTask(obj, task, input_buffer, function (state) {
                contract.methods.add(state, res[0].hash, obj.code_type, res[1].hash).send(send_opt, function (err, tr) {
                    if (err) console.log(err)
                    else console.log("Success", tr)
                    process.exit(0)
                })
            })
    })
}

giveTask(JSON.parse(fs.readFileSync("giver.json")))

