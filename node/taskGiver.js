
var fs = require("fs")
var common = require("./common").make(process.cwd())
var ipfs = common.ipfs
var send_opt = common.send_opt
var contract = common.contract
var logger = common.logger
var winston = require("winston")

logger.add(new winston.transports.Console({
    format: winston.format.simple()
}))

var Storage = common.Storage

var config = {}

function status(msg) {
    config.message = msg
    logger.info(msg)
}

function loadFile(name) {
    return {content:fs.readFileSync(name), path:"bundle/"+name}
}

async function addTask(config, res) {
    var state = await common.initTask(config)
    status("Initialized task")
    var dirhash = res[res.length-1].hash
    var id = await contract.methods.nextTask().call(send_opt)
    var tr = await contract.methods.addWithParameters(state, config.code_type, config.storage, dirhash,
                                                     config.vm_parameters.stack, config.vm_parameters.mem,
                                                     config.vm_parameters.globals, config.vm_parameters.table, config.vm_parameters.call).send(send_opt)
    logger.info("Success", {tr:tr})
    status("Task created, exiting " + tr)
    process.exit(0)
}
    
function giveTask(config) {
    config.actor = {}
    config.kind = "giver"
    config.pid = Math.floor(Math.random()*10000)
    config.log_file = common.log_file
    config.code_file = process.argv[2]
    config.code_type = common.CodeType.WASM
    config.storage = Storage.IPFS
    config.vm_parameters = {
        mem: 20,
        table: 20,
        globals: 10,
        call: 10,
        stack: 20,
    }
    status("Loaded task")

    config.files = []

    for (var i = 3; i < process.argv.length; i++) config.files.push(process.argv[i])

    var files = config.files.map(loadFile)
    files.push(loadFile(config.code_file))

    ipfs.files.add(files, function (err, res) {
            if (err) return logger.error("IPFS error", err)
            logger.info("IPFS", res)
            // store into filesystem
            addTask(config, res)
    })
}

giveTask(config)



