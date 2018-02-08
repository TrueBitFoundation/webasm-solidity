// this will listen to the contract that manages the custom instruction

var fs = require("fs")
var Web3 = require('web3')
var web3 = new Web3()

const mongoose = require('mongoose')
mongoose.connect('mongodb://localhost/truebit')

const File = mongoose.model('File', { root: String, data: String })

const file = new File({
    root: 'ec4101639edb093ea5f5094092f33257ad58fa5d46346fadb3df39b9bca4ff18',
    data: "ec4101639edb093ea5f5094092f33257ad58fa5d46346fadb3df39b9bca4ff18ec4101639edb093ea5f5094092f33257ad58fa5d46346fadb3df39b9bca4ff18ec4101639edb093ea5f5094092f33257ad58fa5d46346fadb3df39b9bca4ff18" 
})

file.save().then(() => console.log('stored'))

async function readData(hash) {
    return File.find({root: hash})
}

var config = JSON.parse(fs.readFileSync("config.json"))

var host = config.host

var send_opt = {gas:4700000, from:config.base}

web3.setProvider(new web3.providers.WebsocketProvider('ws://' + host + ':8546'))

var filesystem = new web3.eth.Contract(JSON.parse(fs.readFileSync("../contracts/compiled/Filesystem.abi")), config.fs)
var merkle = new web3.eth.Contract(JSON.parse(fs.readFileSync("../contracts/compiled/Merkle.abi")), config.merkle)

// parsing the instructions

function pairify(lst) {
    var res = []
    for (var i = 0; i < lst.length/2; i++) {
        res.push([lst[i*2],lst[i*2+1]])
    }
    return res
}

function readInt(str) {
   var buf = Buffer.from(str)
   var i = parseInt(buf.toString("hex"))
   console.log("Reading integer", i)
   return i
}

function readInst(dta) {
  var id = dta.substr(0, 32)
  console.log("My dta is", JSON.stringify(dta))
  console.log("My id is", JSON.stringify(id))

  var res = []
  for (var idx = 32; idx < dta.length; idx += 32) {
      res.push(readInt(dta.substr(idx, 32)))
  }
  return {leaf: id, inst:pairify(res)}
}

function makeProof(leaf, inst) {
}

function fromHex(str) {
    var buf = Buffer.from(str, "hex")
    return buf.toString("binary")
}

async function sendProof(id, state, solver) {
    var dta = await readData(state)
    console.log("Actually reading", dta)
    var obj = readInst(fromHex(dta[0].data))
    var proof = makeProof(obj.leaf, obj.inst)
    // generate proof
    merkle.methods.submitProof(id, obj.leaf, obj.inst, proof)
}

// listen to events

console.log(merkle)

merkle.events.AddedObligation(function (err, ev) {
    if (err) return console.log(err)
    console.log(ev)
    sendProof(ev.args.id, ev.args.state, ev.args.solver)
})

sendProof("1234", 'ec4101639edb093ea5f5094092f33257ad58fa5d46346fadb3df39b9bca4ff18', "0x1092102910291029109201292")
