const assert = require('assert')
const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
const fs = require('fs')

const tasksAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Tasks.abi"))
const fileSystemAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Filesystem.abi"))
const interactiveAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Interactive.abi"))

const config = JSON.parse(fs.readFileSync(__dirname + "/../config.json"))

const merkleComputer = require('../merkle-computer')

const mineBlocks = require('./helper/mineBlocks')

const solverConf = { error: false, error_location: 0, stop_early: -1, deposit: 1 }

function writeFile(fname, buf) {
    return new Promise(function (cont,err) { fs.writeFile(fname, buf, function (err, res) { cont() }) })
}

function midpoint(lowStep, highStep) {
    return Math.floor((highStep - lowStep) / 2 + lowStep)
}

before(async () => {
    accounts = await web3.eth.getAccounts()
    taskGiver = accounts[0]
    solver = accounts[1]
    verifier = accounts[2]
    tasksContract = new web3.eth.Contract(tasksAbi, config["tasks"])
    fileSystemContract = new web3.eth.Contract(fileSystemAbi, config["fs"])
    interactiveContract = new web3.eth.Contract(interactiveAbi, config["interactive"])
    minDeposit = web3.utils.toWei('1', 'ether')
})

describe("Test task lifecycle through wasm game no challenge", async function() {
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

	let config = {
	    code_file: __dirname + "/../data/factorial.wast",
	    input_file: "",
	    actor: {},
	    files: []
	}

	let randomPath = process.cwd() + "/tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

	taskGiverVM = merkleComputer.init(config, randomPath)

	let interpreterArgs = []
	
	initStateHash = (await taskGiverVM.initializeWasmTask(interpreterArgs)).hash
    })

    it("should submit a task", async () => {
	let txReceipt = await tasksContract.methods.add(
	    initStateHash,
	    merkleComputer.CodeType.WAST,
	    merkleComputer.StorageType.BLOCKCHAIN,
	    storageAddress
	).send({from: taskGiver, gas: 300000})

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

	let config = {
	    code_file: process.cwd() + "/tmp.solverWasmCode.wast",
	    input_file: "",
	    actor: solverConf,
	    files: [],
	    vm_parameters: vmParameters,
	    code_type: parseInt(taskInfo.ct)
	}

	let randomPath = process.cwd() + "/tmp.solver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

	solverVM = merkleComputer.init(config, randomPath)

	let interpreterArgs = []

	solverResult = await solverVM.executeWasmTask(interpreterArgs)
    })

    it("should submit solution", async () => {
	let txReceipt = await tasksContract.methods.solveIO(
	    taskID,
	    solverResult.vm.code,
	    solverResult.vm.input_size,
	    solverResult.vm.input_name,
	    solverResult.vm.input_data
	).send({from: solver, gas: 200000})

	let result = txReceipt.events.Solved.returnValues

	assert.equal(taskID, result.id)
	//assert.equal(, result.hash) //which hash is this?
	assert.equal(initStateHash, result.init)
	assert.equal(merkleComputer.CodeType.WAST, result.ct)
	assert.equal(merkleComputer.StorageType.BLOCKCHAIN, result.cs)
	assert.equal(storageAddress, result.stor)
	assert.equal(solver, result.solver)
	assert.equal(result.deposit, web3.utils.toWei('0.01', 'ether'))
    })
    
    it("should finalize task", async () => {

	await mineBlocks(web3, 105)
	
	assert(await tasksContract.methods.finalizeTask(taskID).call())
	
    })

})

describe("Test task lifecycle through wasm game with challenge", async function() {
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

	let config = {
	    code_file: __dirname + "/../data/factorial.wast",
	    input_file: "",
	    actor: {},
	    files: []
	}
	
	let randomPath = process.cwd() + "/tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)
	
	let interpreterArgs = []

	taskGiverVM = merkleComputer.init(config, randomPath)
	
	initStateHash = (await taskGiverVM.initializeWasmTask(interpreterArgs)).hash
	
    })

    it("should submit a task", async () => {
	let txReceipt = await tasksContract.methods.add(
	    initStateHash,
	    merkleComputer.CodeType.WAST,
	    merkleComputer.StorageType.BLOCKCHAIN,
	    storageAddress
	).send({from: taskGiver, gas: 300000})

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

	let config = {
	    code_file: process.cwd() + "/tmp.solverWasmCode.wast",
	    input_file: "",
	    actor: solverConf,
	    files: [],
	    vm_parameters: vmParameters,
	    code_type: parseInt(taskInfo.ct)
	}

	let randomPath = process.cwd() + "/tmp.solver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

	solverVM = merkleComputer.init(config, randomPath)

	let interpreterArgs = []

	solverResult = await solverVM.executeWasmTask(interpreterArgs)

    })

    it("should submit solution", async () => {
	let txReceipt = await tasksContract.methods.solveIO(
	    taskID,
	    solverResult.vm.code,
	    solverResult.vm.input_size,
	    solverResult.vm.input_name,
	    solverResult.vm.input_data
	).send({from: solver, gas: 200000})

	let result = txReceipt.events.Solved.returnValues

	assert.equal(taskID, result.id)
	//assert.equal(, result.hash) //which hash is this?
	assert.equal(initStateHash, result.init)
	assert.equal(merkleComputer.CodeType.WAST, result.ct)
	assert.equal(merkleComputer.StorageType.BLOCKCHAIN, result.cs)
	assert.equal(storageAddress, result.stor)
	assert.equal(solver, result.solver)
	assert.equal(result.deposit, web3.utils.toWei('0.01', 'ether'))
    })

    it("should submit a challenge", async () => {	
	let txReceipt = await tasksContract.methods.challenge(taskID).send({from: verifier, gas: 350000})

	gameID = (await tasksContract.methods.getChallenges(taskID).call())[0]

	assert.equal(await interactiveContract.methods.getChallenger(gameID).call(), verifier)

	assert.equal(await interactiveContract.methods.getProver(gameID).call(), solver)
    })

    it("should initialize the verification game", async () => {

	let interpreterArgs = []
	
	initWasmData = await taskGiverVM.initializeWasmTask(interpreterArgs)

	solverResult = await solverVM.executeWasmTask(interpreterArgs)

	lowStep = 0
	highStep = solverResult.steps - 1

	await interactiveContract.methods.initialize(
	    gameID,
	    merkleComputer.getRoots(initWasmData.vm),
	    merkleComputer.getPointers(initWasmData.vm),
	    solverResult.steps,
	    merkleComputer.getRoots(solverResult.vm),
	    merkleComputer.getPointers(solverResult.vm)
	).send({from: solver, gas: 1000000})
    })

    it("should post response for initial midpoint", async () => {
	let stepNumber = midpoint(lowStep, highStep)

	let interpreterArgs = []

	let stateHash = await solverVM.getLocation(stepNumber, interpreterArgs)

	await interactiveContract.methods.report(gameID, lowStep, highStep, [stateHash]).send({from: solver})
    })

    it("should query step", async () => {
	let taskInfo = await tasksContract.methods.taskInfo(taskID).call()

	let vmParameters = await tasksContract.methods.getVMParameters(taskID).call()

	let config = {
	    code_file: process.cwd() + "/tmp.solverWasmCode.wast",
	    input_file: "",
	    actor: solverConf,
	    files: [],
	    vm_parameters: vmParameters,
	    code_type: parseInt(taskInfo.ct)
	}

	let randomPath = process.cwd() + "/tmp.verifier_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

	verifierVM = merkleComputer.init(config, randomPath)

	let indices = await interactiveContract.methods.getIndices(gameID).call()

	let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	let reportedStateHash = await interactiveContract.methods.getStateAt(gameID, stepNumber).call()
	
	let interpreterArgs = []

	let stateHash = await verifierVM.getLocation(stepNumber, interpreterArgs)

	let num = reportedStateHash == stateHash ? 1 : 0

	let txReceipt = await interactiveContract.methods.query(gameID, parseInt(indices.idx1), parseInt(indices.idx2), num).send({from: verifier})

	let result = txReceipt.events.Queried.returnValues

	assert.equal(result.id, gameID)
	assert.equal(result.idx1, stepNumber)

	lowStep = result.idx1
	highStep = result.idx2
    })

    it("should post response to query", async () => {
	let indices = await interactiveContract.methods.getIndices(gameID).call()
	
	let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	let interpreterArgs = []

	let stateHash = await solverVM.getLocation(stepNumber, interpreterArgs)

	await interactiveContract.methods.report(gameID, indices.idx1, indices.idx2, [stateHash]).send({from: solver})
    })

    for(i = 0; i < 7; i++) {
	it("should submit query", async () => {
	    let indices = await interactiveContract.methods.getIndices(gameID).call()

	    let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	    let reportedStateHash = await interactiveContract.methods.getStateAt(gameID, stepNumber).call()
	    
	    let interpreterArgs = []

	    let stateHash = await verifierVM.getLocation(stepNumber, interpreterArgs)

	    let num = reportedStateHash == stateHash ? 1 : 0

	    let txReceipt = await interactiveContract.methods.query(gameID, parseInt(indices.idx1), parseInt(indices.idx2), num).send({from: verifier})	
	})

	it("should post response to query", async () => {
	    let indices = await interactiveContract.methods.getIndices(gameID).call()
	    
	    let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	    let interpreterArgs = []

	    let stateHash = await solverVM.getLocation(stepNumber, interpreterArgs)

	    await interactiveContract.methods.report(gameID, indices.idx1, indices.idx2, [stateHash]).send({from: solver})
	})

    }

    it("should submit query", async () => {
	let indices = await interactiveContract.methods.getIndices(gameID).call()

	let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	let reportedStateHash = await interactiveContract.methods.getStateAt(gameID, stepNumber).call()
	
	let interpreterArgs = []

	let stateHash = await verifierVM.getLocation(stepNumber, interpreterArgs)

	let num = reportedStateHash == stateHash ? 1 : 0

	let txReceipt = await interactiveContract.methods.query(gameID, parseInt(indices.idx1), parseInt(indices.idx2), num).send({from: verifier})	
    })
    

    it("lowStep + 1 should equal highstep", async () => {
	let indices = await interactiveContract.methods.getIndices(gameID).call()

	let lowStep = parseInt(indices.idx1)
	let highStep = parseInt(indices.idx2)
	assert(lowStep + 1 == highStep)
    })

    it("should post phases", async () => {
	let indices = await interactiveContract.methods.getIndices(gameID).call()

	let lowStep = parseInt(indices.idx1)

	let lowStepState = await interactiveContract.methods.getStateAt(gameID, lowStep).call()
	let highStepState = await interactiveContract.methods.getStateAt(gameID, lowStep+1).call()

	let interpreterArgs = []
	
	let states = (await solverVM.getStep(lowStep, interpreterArgs)).states

	assert.equal(lowStepState, states[0])
	assert.equal(highStepState, states[12])

	await interactiveContract.methods.postPhases(gameID, lowStep, states).send({from: solver, gas: 400000})
    })
})
