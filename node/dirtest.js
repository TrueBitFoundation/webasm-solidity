
var ipfsAPI = require('ipfs-api')
var ipfs = ipfsAPI("programming-progress.com", '5001', {protocol: 'http'})

var lst = ["a", "b", "c"]

var dir = lst.map(str => ({ content:str, path:"dir/"+str }))

/*
ipfs.add(dir, function (err,res) {
    console.log(err, res)
})*/

ipfs.get("QmUjPdzAd74r4d8CGeBTy6Q3bLBeF555EPvPsiUVeaRiPu", function (err, stream) {
    stream.on("data", function (obj) {
        console.log(obj.path)
        if (obj.content) obj.content.on("data", console.log)
    })
})

