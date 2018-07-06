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

const codeFilePath = "/../data/factorial.wast"

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

describe("Test task lifecycle using ipfs with no challenge", async function() {
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

    it("should upload wast code to ipfs", async () => {
	fileName = "bundle/factorial.wast"
	wastCode = await new Promise(async (resolve, reject) => {
	    fs.readFile(__dirname + codeFilePath, async (err, data) => {
		if(err) {
		    reject(err)
		} else {
		    resolve(data)
		}
	    })
	})

	ipfsFileHash = (await fileSystem.upload(wastCode, fileName))[0].hash
    })

    it("should register ipfs file with truebit filesystem", async () => {
	bundleID = await fileSystemContract.methods.makeBundle(
	    Math.floor(Math.random()*Math.pow(2, 60))
	).call(
	    {from: taskGiver}
	)

    	let config = {
    	    code_file: "factorial.wast",
    	    input_file: "",
    	    actor: {},
    	    files: [],
    	    code_type: 0
    	}

    	let randomPath = process.cwd() + "/tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

	if (!fs.existsSync(randomPath)) fs.mkdirSync(randomPath)
	await writeFile(randomPath + "/factorial.wast", wastCode)
    	taskGiverVM = merkleComputer.init(config, randomPath)

    	let interpreterArgs = []
    	
    	let codeRoot = (await taskGiverVM.initializeWasmTask(interpreterArgs)).vm.code
	
	await fileSystemContract.methods.finalizeBundleIPFS(bundleID, ipfsFileHash, codeRoot).send({from: taskGiver, gas: 1300000})
    })

    it("should provide the hash of the initialized state", async () => {
        initHash = await fileSystemContract.methods.getInitHash(bundleID).call({from: taskGiver})
    })

    it("should submit a task", async () => {
        let txReceipt = await tasksContract.methods.add(
    	    initHash,
    	    merkleComputer.CodeType.WAST,
    	    merkleComputer.StorageType.BLOCKCHAIN,
    	    bundleID
    	).send({from: taskGiver, gas: 3000000})

    	let result = txReceipt.events.Posted.returnValues

    	taskID = result.id

    	assert.equal(result.giver, taskGiver)
    	assert.equal(result.hash, initHash)
    	assert.equal(result.stor, bundleID)
    	assert.equal(result.ct, merkleComputer.CodeType.WAST)
    	assert.equal(result.cs, merkleComputer.StorageType.BLOCKCHAIN)
    	assert.equal(result.deposit, web3.utils.toWei('0.01', 'ether'))
    })

    it("should get task data from ipfs and execute task", async () => {

	let codeIPFSHash = await fileSystemContract.methods.getIPFSCode(bundleID).call()

        let name = "task.wast"

	let buf = (await fileSystem.download(codeIPFSHash, name)).content

	let randomPath = process.cwd() + "/tmp.solver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

	if (!fs.existsSync(randomPath)) fs.mkdirSync(randomPath)
	await writeFile(randomPath + "/solverWasmCode.wast", buf)

    	let taskInfo = await tasksContract.methods.taskInfo(taskID).call()

    	let vmParameters = await tasksContract.methods.getVMParameters(taskID).call()

    	let config = {
    	    code_file: "solverWasmCode.wast",
    	    input_file: "",
    	    actor: solverConf,
    	    files: [],
    	    vm_parameters: vmParameters,
    	    code_type: parseInt(taskInfo.ct)
    	}   

    	solverVM = merkleComputer.init(config, randomPath)

    	let interpreterArgs = []
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
    	assert.equal(merkleComputer.CodeType.WAST, result.ct)
    	assert.equal(merkleComputer.StorageType.BLOCKCHAIN, result.cs)
    	assert.equal(bundleID, result.stor)
    	assert.equal(solver, result.solver)
    	assert.equal(result.deposit, web3.utils.toWei('0.01', 'ether'))
    })
    
    it("should finalize task", async () => {

    	await mineBlocks(web3, 105)
	
    	assert(await tasksContract.methods.finalizeTask(taskID).call())
	
    })

})
