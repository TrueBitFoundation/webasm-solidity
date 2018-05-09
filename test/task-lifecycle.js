const assert = require('assert')
const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
const fs = require('fs')

const tasksAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Tasks.abi"))
const fileSystemAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Filesystem.abi"))
const config = JSON.parse(fs.readFileSync(__dirname + "/../config.json"))

const merkleComputer = require('../merkle-computer')

const solverConf = { error: false, error_location: 0, stop_early: -1, deposit: 1 }

function writeFile(fname, buf) {
	return new Promise(function (cont,err) { fs.writeFile(fname, buf, function (err, res) { cont() }) })
}

before(async () => {
	accounts = await web3.eth.getAccounts()
	taskGiver = accounts[0]
	solver = accounts[1]
	verifier = accounts[2]
	tasksContract = new web3.eth.Contract(tasksAbi, config["tasks"])
	fileSystemContract = new web3.eth.Contract(fileSystemAbi, config["fs"])
	minDeposit = web3.utils.toWei('1', 'ether')
})

describe("Test task lifecycle through wasm game", async function() {
	this.timeout(600000)

	it("should make deposits", async () => {

		taskGiverDeposit = await tasksContract.methods.getDeposit(taskGiver).call()
		solverDeposit = await tasksContract.methods.getDeposit(solver).call()
		verifierDeposit = await tasksContract.methods.getDeposit(verifier).call()

		if(taskGiverDeposit < minDeposit) {
			await tasksContract.methods.makeDeposit().send({from: taskGiver, value: minDeposit})
		}

		if(solverDeposit < minDeposit) {
			await tasksContract.methods.makeDeposit().send({from: solver, value: minDeposit})
		}

		if(verifierDeposit < minDeposit) {
			await tasksContract.methods.makeDeposit().send({from: verifier, value: minDeposit})
		}
	})

	it("should upload wast code to blockchain", async () => {
		wastCode = fs.readFileSync(__dirname + "/../data/factorial.wast")
		storageAddress = await merkleComputer.uploadOnchain(wastCode, web3, {from: taskGiver, gas: 400000})
	})

	it("should initialize wasm task", async () => {

		let taskConfig = {
			code_file: __dirname + "/../data/factorial.wast",
			input_file: "",
			actor: {},
			files: []
		}

		let interpreterArgs = []
		
		let randomPath = process.cwd() + "/tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
		initStateHash = await merkleComputer.initializeWasmTask(taskConfig, interpreterArgs, randomPath)
		
	})

	it("should submit a task", async () => {
		let txReceipt = await tasksContract.methods.add(initStateHash, merkleComputer.CodeType.WAST, merkleComputer.StorageType.BLOCKCHAIN, storageAddress).send({from: taskGiver, gas: 300000})

		let result = txReceipt.events.Posted.returnValues

		taskID = result.id

		assert.equal(result.giver, taskGiver)
		assert.equal(result.hash, initStateHash)
		assert.equal(result.stor, storageAddress)
		assert.equal(result.ct, merkleComputer.CodeType.WAST)
		assert.equal(result.cs, merkleComputer.StorageType.BLOCKCHAIN)
		assert.equal(result.deposit, web3.utils.toWei('0.01', 'ether'))
	})

	it("should register file with Truebit filesystem based on task info", async () => {

		let taskInfo = await tasksContract.methods.taskInfo(taskID).call()

		let randomNum = Math.floor(Math.random()*Math.pow(2, 60))

		bundleID = await fileSystemContract.methods.calcId(randomNum).call({from: solver})

		await fileSystemContract.methods.makeSimpleBundle(randomNum, taskInfo.stor, taskInfo.hash, "0x00").send({from: solver, gas: 200000})
	})

	it("should get task data from onchain and execute task", async () => {
		
		let wasmCode = await fileSystemContract.methods.getCode(bundleID).call()

		let buf = Buffer.from(wasmCode.substr(2), "hex")

		await writeFile(process.cwd() + "/tmp.solverWasmCode.wast", buf)

		let taskInfo = await tasksContract.methods.taskInfo(taskID).call()

		let vmParameters = await tasksContract.methods.getVMParameters(taskID).call()

		let taskConfig = {
			code_file: process.cwd() + "/tmp.solverWasmCode.wast",
			input_file: "",
			actor: solverConf,
			files: [],
			vm_parameters: vmParameters,
			code_type: parseInt(taskInfo.ct)
		}

		let interpreterArgs = []

		let randomPath = process.cwd() + "/tmp.solver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
		solverResult = await merkleComputer.executeWasmTask(taskConfig, interpreterArgs, randomPath)
	})

	it("should submit solution", async () => {
		await tasksContract.methods.solveIO(taskID, solverResult.vm.code, solverResult.vm.input_size, solverResult.vm.input_name, solverResult.vm.input_data).send({from: solver, gas: 200000})
	})

})