
var fs = require('fs')

// Load all files
var input = {
    name : [],
    data : [],
}

function loadFile(fn) {
    var buf = fs.readFileSync(fn)
    input.name.push(fn)
    // input.size.push(buf.length)
    input.data.push(buf)
}

function loadedFiles() {
    input.name.push("")
    input.data.push("")
}

// setup command line parameters, needs malloc
function allocArgs(m, lst) {
    var heap8 = new Uint8Array(m.wasmMemory.buffer)
    function setInt(ptr, i) {
        heap8[ptr+0] = ptr&0xff
        heap8[ptr+1] = (ptr>>8)&0xff
        heap8[ptr+2] = (ptr>>16)&0xff
        heap8[ptr+3] = (ptr>>24)&0xff
    }
    var malloc = m.instance.exports._malloc
    var argv = lst.map(function (str) {
        var ptr = malloc(str.length+1)
        for (var i = 0; i < str.length; i++) heap8[ptr+1] = str.charCodeAt(i)
        heap8[ptr+str.length] = 0
        return ptr
    })
    var res = malloc(lst.length*4)
    for (var i = 0; i < lst.length; i++) setInt(res+i*4, argv[i])
    return res
}

var module

// Make our runtime environment for the wasm module
function makeEnv(env) {
    function finalize() {
        module._finalizeSystem()
    }
    env.getTotalMemory = function () { return module['TOTAL_MEMORY']; };
    env.abort = function () { process.exit(-1) }
    env.exit = function () {
        finalize()
        process.exit(0)
    }
    env.debugString = function (ptr) {}
    env.debugBuffer = function (ptr, len) {}
    env.debugInt = function (i) { console.log(i) }
    
    env._inputName = function (i,j) {
        return input.name[i][j] || 0
    }
    
    env._inputSize = function (i,j) {
        return input.data[i].length
    }
    
    env._inputData = function (i,j) {
        return input.data[i][j]
    }
    
    env._outputName = function (i,j,c) {
        var len = Math.max(input.name[i].length, j)
        var buf = Buffer.alloc(len, input.name[i])
        console.log("doing output")
        input.name[i] = buf
        input.name[i][j] = c
    }

    env._outputSize = function (i,sz) {
        input.data[i] = Buffer.alloc(sz)
    }

    env._outputData = function (i,j,c) {
        input.data[i][j] = c
    }
    
    function makeDynamicCall(i) {
        return function () { module["dynCall"+i].apply(null, arguments) }
    }

    // how to handle invokes? probably have to find all dynCalls
    for (var i in env) {
        if (i.substr(0,7) == "dynCall") {
            env["invoke" + i.substr(7)] = makeDynamicCall(i)
        }
    }
    
}

var dta = JSON.parse(fs.readFileSync("info.json"))

async function run(binary, args) {
    var info = { env: {}, global: {NaN: 0/0, Infinity:1/0} }
    // var sz = TOTAL_MEMORY / WASM_PAGE_SIZE
    var sz = 256
    info.env.table = new WebAssembly.Table({ 'initial': 10, 'maximum': 10, 'element': 'anyfunc' });
    info.env.memory = new WebAssembly.Memory({ 'initial': sz, 'maximum': sz })
    
    dta.map(e => { info[e[0]][e[1]] = function () {} })
    
    makeEnv(info.env)
    
    var m = await WebAssembly.instantiate(new Uint8Array(binary), info)
    
    m.wasmMemory = info.env.memory
    
    var e = m.instance.exports
    
    // After building the environment, run the init functions
    if (e.__GLOBAL__I_000101) e.__GLOBAL__I_000101()
    if (e.__GLOBAL__sub_I_iostream_cpp) e.__GLOBAL__sub_I_iostream_cpp()
    if (e._initSystem) e._initSystem()
    
    var argv = allocArgs(m, args)

    e._main(args.length, argv)

    if (m._finalizeSystem) e._finalizeSystem()
    
    for (var i = 0; i < input.data.length; i++) {
        if (input.data[i].length > 0) {
            fs.writeFileSync(input.name[i], input.data[i])
        }
    }
    
}

loadedFiles()

run(fs.readFileSync("globals.wasm"), ["/home/truebit/program.wasm"])

