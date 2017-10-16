
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

// setup command line parameters, needs malloc
function allocArgs(m, lst) {
    var heap8 = new Uint8Array(m.wasmMemory.buffer)
    return lst.map(function (str) {
        var ptr = env._malloc(str.length+1)
        for (var i = 0; i < str.length; i++) heap8[ptr+1] = str.charCodeAt(i)
        heap8[ptr+str.length] = 0
        return ptr
    })
}

// Make our runtime environment for the wasm module
function makeEnv(m) {
    var env = {}
    function finalize() {
        m._finalizeSystem()
    }
    env.getTotalMemory = function () { return m['TOTAL_MEMORY']; };
    env.abort = function () { process.exit(-1) }
    env.exit = function () {
        finalize()
        process.exit(0)
    }
    env.debugString = function (ptr) {}
    env.debugBuffer = function (ptr, len) {}
    env.debugInt = function (i) { console.log(i) }
    
    env._inputName = function (i,j) {
        return input.name[i][j]
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
        return function () { m["dynCall"+i].apply(null, arguments) }
    }

    // how to handle invokes? probably have to find all dynCalls
    for (var i in m) {
        if (i.substr(0,7) == "dynCall") {
            env["invoke" + i.substr(7)] = makeDynamicCall(i)
        }
    }

    // After building the environment, run the init functions
    if (m.__GLOBAL__I_000101) m.__GLOBAL__I_000101()
    if (m.__GLOBAL__sub_I_iostream_cpp) m.__GLOBAL__sub_I_iostream_cpp()
    if (m._initSystem) m._initSystem()
}



