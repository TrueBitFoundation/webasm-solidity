
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
    obj.files = []
    console.log("task", task)
    if (obj.storage == Storage.BLOCKCHAIN) common.upload(task).then(function (address) {
            // store into filesystem
            common.simpleInitTask(obj, [{name:obj.code_file, content:task}], function (state) {
                contract.methods.add(state, address, obj.code_type, obj.code_storage, res[0].hash).send(send_opt, function (err, tr) {
                    if (err) logger.error("Failed to add task", err)
                    else logger.error("Success", tr)
                    process.exit(0)
                })
            })
    })
    else ipfs.files.add([{content:task, path:"bundle/"+obj.code_file}, {content:input_buffer, path:"bundle/"+obj.input_file}], function (err, res) {
            if (err) return logger.error("IPFS error", err)
            logger.info("IPFS", res)
            // store into filesystem
            obj.files = [obj.inputfile]
            common.initTask(obj).then(function (state) {
                logger.info("Creating task ", {state:state, codehash: res[0].hash, codetype: obj.code_type, codestorage: obj.code_storage, inputhash: res[1].hash,
                                               dirhash: res[2].hash})
                contract.methods.add(state, obj.code_type, obj.storage, res[2].hash).send(send_opt, function (err, tr) {
                    if (err) logger.error("Failed to add task", err)
                    else logger.error("Success", tr)
                    process.exit(0)
                })
            })
    })
}

giveTask(JSON.parse(fs.readFileSync("giver.json")))

