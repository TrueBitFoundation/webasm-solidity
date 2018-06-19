const assert = require('assert')
const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
const fs = require('fs')

const fileSystemAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Filesystem.abi"))

const config = JSON.parse(fs.readFileSync(__dirname + "/../config.json"))

const host = config.host || "localhost"
const ipfsHost = host

const ipfs = require('ipfs-api')(ipfsHost, '5001', {protocol: 'http'})

const merkleComputer = require('../merkle-computer')()

const fileSystem = merkleComputer.fileSystem(ipfs)

const codeFilePath = "/../data/factorial.wast"

before(async () => {
    accounts = await web3.eth.getAccounts()
    taskGiver = accounts[0]    
    fileSystemContract = new web3.eth.Contract(fileSystemAbi, config["fs"])
})

describe("Test task lifecycle using ipfs with no challenge", async function() {
    this.timeout(600000)
    
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

	let randomNum = Math.floor(Math.random()*Math.pow(2, 60))

	let size = wastCode.byteLength

	let root = merkleComputer.merkleRoot(web3, wastCode)

	let fileID = await fileSystemContract.methods.addIPFSFile(
	    fileName,
	    size,
	    ipfsFileHash,
	    root,
	    randomNum
	).call(
	    {from: taskGiver}
	)

	await fileSystemContract.methods.addIPFSFile(
	    fileName,
	    size,
	    ipfsFileHash,
	    root,
	    randomNum
	).send({from: taskGiver, gas: 200000})

	await fileSystemContract.methods.addToBundle(bundleID, fileID).send({from: taskGiver})

	await fileSystemContract.methods.finalizeBundleIPFS(bundleID, ipfsFileHash, root).send({from: taskGiver, gas: 1500000})

	onChainInitHash = await fileSystemContract.methods.getInitHash(bundleID).call()
	
    })

    it("should provide the hash of the initialized state", async () => {

    	let config = {
    	    code_file: __dirname + codeFilePath,
    	    input_file: "",
    	    actor: {},
    	    files: [],
    	    code_type: 0
    	}

    	let randomPath = process.cwd() + "/tmp.giver_" + Math.floor(Math.random()*Math.pow(2, 60)).toString(32)

    	taskGiverVM = merkleComputer.init(config, randomPath)

    	let interpreterArgs = []
	
    	offChainInitHash = (await taskGiverVM.initializeWasmTask(interpreterArgs)).hash
    })    

    it("hashes should be equal", async () => {
	assert.equal(onChainInitHash, offChainInitHash)
    })
        
})
