
exports.make = function (dir, config) {

var fs = require("fs")
var common = require("./common").make(dir)
var appFile = common.appFile
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract
var logger = common.logger

var Storage = common.Storage

// Now the file names do not have to be special

var socket = require('socket.io-client')('http://localhost:22448')

function status(msg) {
    config.message = msg
    socket.emit("config", config)
    logger.info(msg)
}

function giveTask(obj) {
    var task = fs.readFileSync(dir + "/" + obj.taskfile)
    var input = fs.readFileSync(dir + "/" + obj.inputfile)
    // var input_buffer = appFile.inputToBuffer(input)
    obj.code_file = obj.taskfile
    obj.input_file = obj.inputfile
    obj.actor = {}
    obj.files = []
    config.kind = "giver"
    config.pid = Math.floor(Math.random()*10000)
    config.log_file = common.log_file
    status("Loaded task")
    
    if (obj.storage == Storage.BLOCKCHAIN) common.upload(task).then(function (address) {
            // store into filesystem
            common.initTask(obj).then(function (state) {
                contract.methods.add(state, obj.code_type, obj.storage, address).send(send_opt, function (err, tr) {
                    if (err) return logger.error("Failed to add task", err)
                    logger.error("Success", tr)
                    // process.exit(0)
                })
            })
    })
    else ipfs.files.add([{content:task, path:"bundle/"+obj.code_file}, {content:input, path:"bundle/"+obj.input_file}], function (err, res) {
            if (err) return logger.error("IPFS error", {msg:err, res:res})
            logger.info("IPFS", res)
            // store into filesystem
            obj.files = [obj.inputfile]
            common.initTask(obj).then(function (state) {
                status("Initialized task")
                logger.info("Creating task ", {state:state, codehash: res[0].hash, codetype: obj.code_type, codestorage: obj.code_storage, inputhash: res[1].hash,
                                               dirhash: res[2].hash})
                contract.methods.add(state, obj.code_type, obj.storage, res[2].hash).send(send_opt, function (err, tr) {
                    if (err) return logger.error("Failed to add task", {error:err, tx:tr})
                    logger.info("Success", {tr:tr})
                    status("Task created, exiting " + tr)
                    // process.exit(0)
                })
            })
    })
}

giveTask(config)

}
