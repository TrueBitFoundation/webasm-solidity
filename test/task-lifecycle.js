const assert = require('assert')
const Web3 = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
const fs = require('fs')

const tasksAbi = JSON.parse(fs.readFileSync(__dirname + "/../contracts/compiled/Tasks.abi"))
const addresses = JSON.parse(fs.readFileSync(__dirname + "/../config.json"))

before(async () => {
	accounts = await web3.eth.getAccounts()
	taskGiver = accounts[0]
	solver = accounts[1]
	verifier = accounts[2]
	tasksContract = new web3.eth.Contract(tasksAbi, addresses["tasks"])
	minDeposit = web3.utils.toWei('1', 'ether')
})

describe("Test task lifecycle through wasm game", async () => {
	this.timeout = 600000

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

	it("submit a task", async () => {

	})
})