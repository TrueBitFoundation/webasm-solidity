const assert = require('assert')
const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
const fs = require('fs')

const tasksAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Tasks.abi"))
const fileSystemAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Filesystem.abi"))
const interactiveAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Interactive.abi"))

const config = JSON.parse(fs.readFileSync(__dirname + "/../config.json"))

const host = config.host || "localhost"
const ipfsHost = host

const ipfs = require('ipfs-api')(ipfsHost, '5001', {protocol: 'http'})

const merkleComputer = require('../merkle-computer')()

const fileSystem = merkleComputer.fileSystem(ipfs)

const mineBlocks = require('./helper/mineBlocks')

const solverConf = { error: false, error_location: 0, stop_early: -1, deposit: 1 }

const codeFilePath = "/../data/reverse_alphabet.wasm"
const inputFilePath = "/../alphabet.txt"
const outputFilePath = "/../reverse_alphabet.txt"

function writeFile(fname, buf) {
    return new Promise(function (cont,err) { fs.writeFile(fname, buf, function (err, res) { cont() }) })
}

function readFile(fname) {
    return new Promise((resolve, reject) => {
	fs.readFile(fname, (err, res) => {
	if (err) reject(err)
	    else resolve(res)
	})
    })
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

describe("Test reverse alphabet wasm task with challenge", async function() {
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

    it("should create bundle", async () => {
	//console.log(Math.floor(Math.random()*Math.pow(2, 60)))
	bundleID = await fileSystemContract.methods.makeBundle(
	    Math.floor(Math.random()*Math.pow(2, 60))
	).call(
	    {from: taskGiver}
        )
        //console.log("bundle id", bundleID)
    })

    it("should upload and register input ipfs file w/ truebit fs", async () => {
	inputFile = await readFile(__dirname + inputFilePath)
	let inputSize = inputFile.byteLength
	let inputRoot = merkleComputer.merkleRoot(web3, inputFile)
	let inputIPFSHash = (await fileSystem.upload(inputFile, "bundle/alphabet.txt"))[0].hash
	let inputNonce = 100//use derterministic nonce for testing

	let inputFileID = await fileSystemContract.methods.addIPFSFile(
	    'alphabet.txt',
	    inputSize,
	    inputIPFSHash,
	    inputRoot,
	    inputNonce
	).call({from: taskGiver})

	await fileSystemContract.methods.addIPFSFile(
	    'alphabet.txt',
	    inputSize,
	    inputIPFSHash,
	    inputRoot,
	    inputNonce
	).send({from: taskGiver, gas: 200000})

        //console.log("in root", await fileSystemContract.methods.getRoot(inputFileID).call())

	await fileSystemContract.methods.addToBundle(bundleID, inputFileID).send({from: taskGiver})
    })

    it("should upload and register output ipfs file w/ truebit fs", async () => {
	outputFile = await readFile(__dirname + outputFilePath)
	let outputSize = outputFile.byteLength
	let outputRoot = merkleComputer.merkleRoot(web3, outputFile)
	let outputIPFSHash = (await fileSystem.upload(outputFile, "bundle/reverse_alphabet.txt"))[0].hash
	let outputNonce = 101//use derterministic nonce for testing

	let outputFileID = await fileSystemContract.methods.addIPFSFile(
	    'reverse_alphabet.txt',
	    outputSize,
	    outputIPFSHash,
	    outputRoot,
	    outputNonce
	).call({from: taskGiver})

	await fileSystemContract.methods.addIPFSFile(
	    'reverse_alphabet.txt',
	    outputSize,
	    outputIPFSHash,
	    outputRoot,
	    outputNonce
	).send({from: taskGiver, gas: 200000})
	
        //console.log("out root", await fileSystemContract.methods.getRoot(outputFileID).call())

	await fileSystemContract.methods.addToBundle(bundleID, outputFileID).send({from: taskGiver})
    })    

    it("should upload wast code to ipfs", async () => {
	fileName = "bundle/alphabet.wasm"
	wasmCode = await readFile(__dirname + codeFilePath)

	ipfsFileHash = (await fileSystem.upload(wasmCode, fileName))[0].hash
    })    

    it("should register ipfs file with truebit filesystem", async () => {

	//Upload and register input and output files
    	let randomPath = process.cwd() + "/tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)	
	
	if (!fs.existsSync(randomPath)) fs.mkdirSync(randomPath)
	await writeFile(randomPath + "/reverse_alphabet.wasm", wasmCode)
	await writeFile(randomPath + "/alphabet.txt", inputFile)
	await writeFile(randomPath + "/reverse_alphabet.txt", outputFile)

	let size = wasmCode.byteLength

    	let config = {
    	    code_file: "reverse_alphabet.wasm",
    	    input_file: "alphabet.txt",
    	    actor: {},
    	    files: ['alphabet.txt', 'reverse_alphabet.txt'],
    	    code_type: merkleComputer.CodeType.WASM
    	}

	let interpreterArgs = ['-asmjs']

    	taskGiverVM = merkleComputer.init(config, randomPath)
    	
    	let codeRoot = (await taskGiverVM.initializeWasmTask(interpreterArgs)).vm.code
        //console.log("code root", codeRoot)
	
	//console.log(await fileSystemContract.methods.debug_finalizeBundleIPFS(bundleID, ipfsFileHash, codeRoot).call({from: taskGiver, gas: 8000000}))
	await fileSystemContract.methods.finalizeBundleIPFS(bundleID, ipfsFileHash, codeRoot).send({from: taskGiver, gas: 2000000})
    })

    it("should provide the hash of the initialized state", async () => {
        initHash = await fileSystemContract.methods.getInitHash(bundleID).call({from: taskGiver})
        //console.log(initHash)
    })

    it("should submit a task", async () => {
        let txReceipt = await tasksContract.methods.add(
    	    initHash,
    	    merkleComputer.CodeType.WASM,
    	    merkleComputer.StorageType.BLOCKCHAIN,
    	    bundleID
    	).send({from: taskGiver, gas: 3000000})

    	let result = txReceipt.events.Posted.returnValues

    	taskID = result.id

    	assert.equal(result.giver, taskGiver)
    	assert.equal(result.hash, initHash)
    	assert.equal(result.stor, bundleID)
    	assert.equal(result.ct, merkleComputer.CodeType.WASM)
    	assert.equal(result.cs, merkleComputer.StorageType.BLOCKCHAIN)
    	assert.equal(result.deposit, web3.utils.toWei('0.01', 'ether'))
    })

    it("should get task data from ipfs and execute task", async () => {

	let codeIPFSHash = await fileSystemContract.methods.getIPFSCode(bundleID).call()

        let name = "task.wast"

	let buf = (await fileSystem.download(codeIPFSHash, name)).content

	solverRandomPath = process.cwd() + "/tmp.solver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

	let randomPath = solverRandomPath

	if (!fs.existsSync(randomPath)) fs.mkdirSync(randomPath)
    	await writeFile(randomPath + "/solverWasmCode.wasm", buf)
	    await writeFile(randomPath + "/alphabet.txt", inputFile)
	    await writeFile(randomPath + "/reverse_alphabet.txt", outputFile)

    	let taskInfo = await tasksContract.methods.taskInfo(taskID).call()

    	let vmParameters = await tasksContract.methods.getVMParameters(taskID).call()

    	let config = {
    	    code_file: "solverWasmCode.wasm",
    	    input_file: "alphabet.txt",
    	    actor: solverConf,
    	    files: ['alphabet.txt', 'reverse_alphabet.txt'],
    	    vm_parameters: vmParameters,
    	    code_type: parseInt(taskInfo.ct)
    	}    	

    	solverVM = merkleComputer.init(config, randomPath)

	let interpreterArgs = ['-asmjs']
    	
    	let root = (await taskGiverVM.initializeWasmTask(interpreterArgs)).hash
	
    	// Check that we have the same initial state as onchain task
        assert.equal(root, initHash)

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
    	assert.equal(initHash, result.init)
    	assert.equal(merkleComputer.CodeType.WASM, result.ct)
    	assert.equal(merkleComputer.StorageType.BLOCKCHAIN, result.cs)
    	assert.equal(bundleID, result.stor)
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

	let interpreterArgs = ['-asmjs']
	
	initWasmData = await solverVM.initializeWasmTask(interpreterArgs)
	
	lowStep = 0
	highStep = solverResult.steps

	console.log("test", await interactiveContract.methods.initialize(
	    gameID,
	    merkleComputer.getRoots(initWasmData.vm),
	    merkleComputer.getPointers(initWasmData.vm),
	    solverResult.steps + 1,
	    merkleComputer.getRoots(solverResult.vm),
	    merkleComputer.getPointers(solverResult.vm)
	).call({from: solver, gas: 1000000}))
	
	await interactiveContract.methods.initialize(
	    gameID,
	    merkleComputer.getRoots(initWasmData.vm),
	    merkleComputer.getPointers(initWasmData.vm),
	    solverResult.steps + 1,
	    merkleComputer.getRoots(solverResult.vm),
	    merkleComputer.getPointers(solverResult.vm)
	).send({from: solver, gas: 1000000})
	
	let highStepState = await interactiveContract.methods.getStateAt(gameID, 11249).call()
    
    console.log("end state", highStepState, solverResult.vm, merkleComputer.getRoots(solverResult.vm), merkleComputer.getPointers(solverResult.vm))
    
    })

    it("should post response for initial midpoint", async () => {
	let stepNumber = midpoint(lowStep, highStep)

	let interpreterArgs = ['-asmjs']

	let stateHash = await solverVM.getLocation(stepNumber, interpreterArgs)

	await interactiveContract.methods.report(gameID, lowStep, highStep, [stateHash]).send({from: solver})
    })

    it("should query step", async () => {
	let taskInfo = await tasksContract.methods.taskInfo(taskID).call()

	let vmParameters = await tasksContract.methods.getVMParameters(taskID).call()

    	let config = {
    	    code_file: "solverWasmCode.wasm",
    	    input_file: "alphabet.txt",
    	    actor: solverConf,
    	    files: ['alphabet.txt', 'reverse_alphabet.txt'],
    	    vm_parameters: vmParameters,
    	    code_type: parseInt(taskInfo.ct)
    	}    	
	
	verifierVM = merkleComputer.init(config, solverRandomPath)

	let indices = await interactiveContract.methods.getIndices(gameID).call()

	let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	let reportedStateHash = await interactiveContract.methods.getStateAt(gameID, stepNumber).call()
	
	let interpreterArgs = ['-asmjs']

	let stateHash = await verifierVM.getLocation(stepNumber, interpreterArgs)

	let num = reportedStateHash == stateHash ? 1 : 0

	let txReceipt = await interactiveContract.methods.query(gameID, parseInt(indices.idx1), parseInt(indices.idx2), num).send({from: verifier})

	let result = txReceipt.events.Queried.returnValues

	assert.equal(result.id, gameID)
	assert.equal(result.idx1, stepNumber)

    })

    it("should post response to query", async () => {
	let indices = await interactiveContract.methods.getIndices(gameID).call()
	
	let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	let interpreterArgs = ['-asmjs']

	let stateHash = await solverVM.getLocation(stepNumber, interpreterArgs)

	await interactiveContract.methods.report(gameID, indices.idx1, indices.idx2, [stateHash]).send({from: solver})
    })

    for(i = 0; i < 12; i++) {
	it("should submit query", async () => {
	    let indices = await interactiveContract.methods.getIndices(gameID).call()

	    let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	    let reportedStateHash = await interactiveContract.methods.getStateAt(gameID, stepNumber).call()
	    
	    let interpreterArgs = ['-asmjs']

	    let stateHash = await verifierVM.getLocation(stepNumber, interpreterArgs)

	    let num = reportedStateHash == stateHash ? 1 : 0

	    let txReceipt = await interactiveContract.methods.query(gameID, parseInt(indices.idx1), parseInt(indices.idx2), num).send({from: verifier})	
	})

	it("should post response to query", async () => {
	    let indices = await interactiveContract.methods.getIndices(gameID).call()
	    
	    let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	    let interpreterArgs = ['-asmjs']

	    let stateHash = await solverVM.getLocation(stepNumber, interpreterArgs)

	    await interactiveContract.methods.report(gameID, indices.idx1, indices.idx2, [stateHash]).send({from: solver})
	})

    }

    it("should submit query", async () => {
	let indices = await interactiveContract.methods.getIndices(gameID).call()

	let stepNumber = midpoint(parseInt(indices.idx1), parseInt(indices.idx2))

	let reportedStateHash = await interactiveContract.methods.getStateAt(gameID, stepNumber).call()
	
	let interpreterArgs = ['-asmjs']

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
    
    console.log("at step", lowStep, "state transition", lowStepState, highStepState)

	let interpreterArgs = ['-asmjs']
	
	let states = (await solverVM.getStep(lowStep, interpreterArgs)).states

	assert.equal(lowStepState, states[0])
	assert.equal(highStepState, states[12])

	let txReceipt = await interactiveContract.methods.postPhases(gameID, lowStep, states).send({from: solver, gas: 400000})

	phases = txReceipt.events.PostedPhases.returnValues.arr
    })

    it("should select phase", async () => {
	let indices = await interactiveContract.methods.getIndices(gameID).call()

	let lowStep = parseInt(indices.idx1)

	let interpreterArgs = ['-asmjs']

	//Not needed for the test, but is needed for implementation
	//let states = (await verifierVM.getStep(lowStep, interpreterArgs)).states

	let txReceipt = await interactiveContract.methods.selectPhase(gameID, lowStep, phases[1], 1).send({from: verifier})

	phase = parseInt(txReceipt.events.SelectedPhase.returnValues.phase)
	
    })

    it("should call judge", async () => {
    	let indices = await interactiveContract.methods.getIndices(gameID).call()

    	let lowStep = parseInt(indices.idx1)

    	let interpreterArgs = ['-asmjs']

    	let stepResults = await solverVM.getStep(lowStep, interpreterArgs)

    	let phaseStep = merkleComputer.phaseTable[phase]

    	let proof = stepResults[merkleComputer.phaseTable[phase]]

    	let merkle = proof.location || []

    	let merkle2 = []

        if (proof.merkle) {
            merkle = proof.merkle.list || proof.merkle.list1 || []
            merkle2 = proof.merkle.list2 || []
        }

    	let m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}

    	let vm = proof.vm
	
    	await interactiveContract.methods.callJudge(
    	    gameID,
    	    lowStep,
    	    phase,
    	    merkle,
    	    merkle2,
    	    m.vm,
    	    m.op,
    	    [m.reg1, m.reg2, m.reg3, m.ireg],
    	    merkleComputer.getRoots(vm),
    	    merkleComputer.getPointers(vm)
    	).send({from: solver, gas: 5000000})
    })
            
    it("should finalize task", async () => {

    	await mineBlocks(web3, 105)
	
    	assert(await tasksContract.methods.finalizeTask(taskID).call())
	
    })

})
