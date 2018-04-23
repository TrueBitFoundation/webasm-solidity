
const fs = require("fs")

var obj = JSON.parse(fs.readFileSync("config.json"))

obj.tasks = obj.resubmit

console.log(obj)

fs.writeFileSync("config.json", JSON.stringify(obj))

