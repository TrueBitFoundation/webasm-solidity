const execFile = require('child_process').execFile
const winston = require("winston")

const wasmInterpreterPath = process.cwd() + "/../ocaml-offchain/interpreter/wasm"

const format = winston.format

const CodeType = {
    WAST: 0,
    WASM: 1,
    INTERNAL: 2,
    INPUT : 3,
}

const StorageType = {
    IPFS: 0,
    BLOCKCHAIN: 1,
}

function buildArgs(args, config) {
    if (config.actor.error) {
	args.push("-insert-error")
	args.push("" + config.actor.error_location)
    }
    if (config.vm_parameters) {
	args.push("-memory-size")
	args.push(config.vm_parameters.mem)
	args.push("-stack-size")
	args.push(config.vm_parameters.stack)
	args.push("-table-size")
	args.push(config.vm_parameters.table)
	args.push("-globals-size")
	args.push(config.vm_parameters.globals)
	args.push("-call-stack-size")
	args.push(config.vm_parameters.call)
    }
    for (i in config.files) {
	args.push("-file")
	args.push("" + config.files[config.files.length - i - 1])
    }
    if (config.code_type == CodeType.WAST) ["-case", "0", config.code_file].forEach(a => args.push(a))
    else ["-wasm", config.code_file].forEach(a => args.push(a))
    //logger.info("Built args", {args:args})
    return args
}

function exec(config, lst, interpreterArgs, path) {
    let args = buildArgs(lst, config).concat(interpreterArgs)
    return new Promise(function (resolve, reject) {
	execFile(wasmInterpreterPath, args, function (error, stdout, stderr) {
	    //if (stderr) logger.error('error %s', stderr, args)
	    //if (stdout) logger.info('output %s', stdout, args)
	    if (error) reject(error)
	    else resolve(stdout)
	})
    })
}


module.exports = {

    CodeType: CodeType,
    StorageType: StorageType,

    uploadOnchain: async (data, web3, options) => {
	let sz = data.length.toString(16)
	if (sz.length == 1) sz = "000" + sz
	else if (sz.length == 2) sz = "00" + sz
	else if (sz.length == 3) sz = "0" + sz

	let init_code = "61"+sz+"600061"+sz+"600e600039f3"

	let contract = new web3.eth.Contract([])

	let hex_data = Buffer.from(data).toString("hex")

	contract = await contract.deploy({data: '0x' + init_code + hex_data}).send(options)
	
	return contract.options.address
    },

    init: (config, path) => {
	return {
	    initializeWasmTask: async (interpreterArgs) => {
		let stdout = await exec(config, ["-m", "-input"], interpreterArgs, path)
		return JSON.parse(stdout)
	    },

	    executeWasmTask: async(interpreterArgs) => {
		let stdout = await exec(config, ["-m", "-output"], interpreterArgs, path)
		return JSON.parse(stdout)
	    },
	    getLocation: async(stepNumber, interpreterArgs) => {
		let stdout = await exec(config, ["-m", "-location", stepNumber], interpreterArgs, path)

		return JSON.parse(stdout)
	    }
	    
	}

    },
    
    getRoots: (vm) => {
	return [
	    vm.code,
	    vm.stack,
	    vm.memory,
	    vm.call_stack,
	    vm.globals,
	    vm.calltable,
	    vm.calltypes,
	    vm.input_size,
	    vm.input_name,
	    vm.input_data
	]
    },

    getPointers: (vm) => {
	return [
	    vm.pc,
	    vm.stack_ptr,
	    vm.call_ptr,
	    vm.memsize
	]
    },
}
