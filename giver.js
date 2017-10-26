
var fs = require("fs")
var common = require("./common")
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract
var logger = common.logger

var Storage = common.Storage

// Now the file names do not have to be special

function giveTask(obj) {
    var task = fs.readFileSync(obj.taskfile)
    var input = fs.readFileSync(obj.inputfile)
    var input_buffer = appFile.inputToBuffer(input)
    obj.code_file = obj.taskfile
    obj.input_file = obj.inputfile
    obj.actor = {}
    if (obj.code_storage == Storage.BLOCKCHAIN) common.upload(task).then(function (address) {
        ipfs.files.add([input_buffer], function (err, res) {
            if (err) return logger.error("IPFS error", err)
            logger.info("IPFS", res)
            // store into filesystem
            common.initTask(obj, task, input_buffer, function (state) {
                contract.methods.add(state, address, obj.code_type, obj.code_storage, res[0].hash).send(send_opt, function (err, tr) {
                    if (err) logger.error("Failed to add task", err)
                    else logger.error("Success", tr)
                    process.exit(0)
                })
            })
        })

    })
    else ipfs.files.add([task, input_buffer], function (err, res) {
            if (err) return logger.error("IPFS error", err)
            logger.info("IPFS", res)
            // store into filesystem
            common.initTask(obj, task, input_buffer, function (state) {
                logger.info("Creating task ", {state:state, codehash: res[0].hash, codetype: obj.code_type, codestorage: obj.code_storage, inputhash: res[1].hash})
                contract.methods.add(state, res[0].hash, obj.code_type, obj.code_storage, res[1].hash).send(send_opt, function (err, tr) {
                    if (err) logger.error("Failed to add task", err)
                    else logger.error("Success", tr)
                    process.exit(0)
                })
            })
    })
}

giveTask(JSON.parse(fs.readFileSync("giver.json")))

