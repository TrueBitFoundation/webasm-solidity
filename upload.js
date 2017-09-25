
var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

if (process.argv.length < 3) {
    console.error("Give the hexfile to upload as an argument!")
    process.exit(1)
}

var host = process.argv[3] || "localhost"
var file = process.argv[2]

web3.setProvider(new web3.providers.HttpProvider('http://' + host + ':8545'))

var base = web3.eth.coinbase

var data = fs.readFileSync(file)

var abi = JSON.parse(fs.readFileSync("contracts/GetCode.abi"))
var code = fs.readFileSync("contracts/GetCode.bin")

var send_opt = {from:base, gas: 4000000}

var contract = web3.eth.contract([])

var check_contract = web3.eth.contract(abi)

// Assume the length is two bytes
var sz = (data.length/2).toString(16)
if (sz.length == 1) sz = "000" + sz
else if (sz.length == 2) sz = "00" + sz
else if (sz.length == 3) sz = "0" + sz

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

var init_code = "61"+sz+"600061"+sz+"600e600039f3"

contract.new({from: base, data: '0x' + init_code + data, gas: '90000000'}, function (e, c) {
    if (e) console.error(e)
    if (typeof c.address !== 'undefined') {
        console.log("storage added to", c.address)
        check_contract.new({from: base, data: '0x' + code, gas: '4000000'}, function (e, check) {
            if (e) console.error(e)
            if (typeof check.address !== 'undefined') {
                console.log("checking storage with", check.address)
                check.get.call(c.address, function (err,res) {
                    if (err) console.error(err)
                    else console.log(res)
                })
            }
        })
    }
})

