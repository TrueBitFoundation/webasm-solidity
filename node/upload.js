
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

if (process.argv.length < 3) {
    console.error("Give the hexfile to upload as an argument!")
    process.exit(1)
}

var host = process.argv[3] || "localhost"
var file = process.argv[2]

web3.setProvider(new web3.providers.WebsocketProvider('http://' + host + ':8546'))

var data = fs.readFileSync(file, "hex")

var abi = JSON.parse(fs.readFileSync("../contracts/compiled/GetCode.abi"))
var code = fs.readFileSync("../contracts/compiled/GetCode.bin")

/*
    Assembly of the code that we want to use as init-code in the new contract, 
    along with stack values:
                      # bottom [ STACK ] top
     PUSH2 size       # [ size ]
     PUSH1 00         # [ size, 0 ]
     PUSH2 size       # [ size, 0, size ]
     PUSH1 init_size  # [ size, 0, size, init_size ]
     PUSH1 00         # [ size, 0, size, init_size, 0 ]
     CODECOPY         # [ size, 0]
     RETURN
     
     init_size = 14
     
*/

// Assume the length has two bytes
var sz = (data.length/2).toString(16)
if (sz.length == 1) sz = "000" + sz
else if (sz.length == 2) sz = "00" + sz
else if (sz.length == 3) sz = "0" + sz

var init_code = "61"+sz+"600061"+sz+"600e600039f3"

async function upload() {
    var accts = await web3.eth.getAccounts()
    var base = accts[0]
    var contr = new web3.eth.Contract(abi)
    var send_opt = {from: base, gas: '4500000'}
    
    var contract = new web3.eth.Contract([])

    var check = new web3.eth.Contract(abi)

    contract = await contract.deploy({data: '0x' + init_code + data}).send(send_opt)
    console.error("storage added to", contract.options.address)
    var check = await check.deploy({data: '0x' + code}).send(send_opt)
    console.error("checking storage with", check.options.address)
    var res = await check.methods.get(contract.options.address).call()
    console.log(res)
    process.exit(0)
}

upload()

