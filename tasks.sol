pragma solidity ^0.4.16;

import "./fs.sol";

interface Interactive {
    function make(uint task_id, address p, address c, bytes32 s, bytes32 e, uint256 par, uint to) public returns (bytes32);
    function makeFinality(uint task_id, address p, address c, bytes32 s, bytes32 e, uint256 _steps, uint to) public returns (bytes32);
    
    function calcStateHash(bytes32[10] roots, uint[4] pointers) public returns (bytes32);
    function checkFileProof(bytes32 state, bytes32[10] roots, uint[4] pointers, bytes32[] proof, uint loc) public returns (bool);
    
    // Check if a task has been rejected
    function isRejected(uint id) public returns (bool);
    // Check if a task is blocked, returns the block when it can be accepted
    function blockedTime(uint id) public returns (uint);
}

interface Callback {
    function solved(uint id, bytes32 result, bytes32 file) public;
}

contract Tasks is Filesystem {

    enum CodeType {
        WAST,
        WASM,
        INTERNAL
    }

    enum Storage {
        IPFS,
        BLOCKCHAIN
    }

    event Posted(address giver, bytes32 hash, CodeType ct, Storage cs, string stor, uint id);
    event Solved(uint id, bytes32 hash, bytes32 init, CodeType ct, Storage cs, string stor, address solver);
    event Finalized(uint id);

    Interactive iactive;

    function Tasks(address contr) public {
        iactive = Interactive(contr);
    }

    function getInteractive() public view returns (address) {
        return address(iactive);
    }
    
    struct IO {
       bytes32 name;
       bytes32 size;
       bytes32 data;
    }

    struct VMParameters {
        uint8 stack_size;
        uint8 memory_size;
        uint8 call_size;
        uint8 globals_size;
        uint8 table_size;
    }

    struct Task2 {
        address solver;
        bytes32 result;
        
        bytes32 output_file;
        
        bool good; // has the file been loaded
        uint blocked; // how long we have to wait to accept solution
        
        bytes32[] challenges;
    }

    struct Task {
        address giver;
        bytes32 init; // includes code and input roots, the output should be similar
        string stor;
        
        CodeType code_type;
        Storage storage_type;
        
        uint state;
    }

    Task[] public tasks;
    Task2[] public tasks2;
    VMParameters[] params;
    IO[] io_roots;
    
    mapping (bytes32 => uint) challenges;
    
    function defaultParameters(uint id) internal {
        VMParameters storage param = params[id];
        param.stack_size = 14;
        param.memory_size = 16;
        param.globals_size = 8;
        param.table_size = 8;
        param.call_size = 10;
    }

    function add(bytes32 init, CodeType ct, Storage cs, string stor) public returns (uint) {
        uint id = tasks.length;
        tasks.length++;
        tasks2.length++;
        params.length++;
        io_roots.length++;
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        t.giver = msg.sender;
        t.init = init;
        t.stor = stor;
        t2.good = true;
        t.code_type = ct;
        t.storage_type = cs;
        defaultParameters(id);
        Posted(msg.sender, init, ct, cs, stor, id);
        return id;
    }
    
    function setVMParameters(uint id, uint8 stack, uint8 mem, uint8 globals, uint8 table, uint8 call) public {
        require(msg.sender == tasks[id].giver);
        VMParameters storage param = params[id];
        param.stack_size = stack;
        param.memory_size = mem;
        param.globals_size = globals;
        param.table_size = table;
        param.call_size = call;
    }

    function getVMParameters(uint id) public view returns (uint8 stack, uint8 mem, uint8 globals, uint8 table, uint8 call) {
        VMParameters storage param = params[id];
        stack = param.stack_size;
        mem = param.memory_size;
        globals = param.globals_size;
        table = param.table_size;
        call = param.call_size;
    }

    function getSolver(uint id) public view returns (address) {
        return tasks2[id].solver;
    }

    function solve(uint id, bytes32 result) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        require(t2.solver == 0 && t2.good);
        t2.solver = msg.sender;
        t2.result = result;
        t.state = 1;
        t2.blocked = block.number + 10;
        Solved(id, t2.result, t.init, t.code_type, t.storage_type, t.stor, t2.solver);
    }

    /*
    function getCodeType(uint id) public view returns (CodeType) {
        return tasks[id].code_type;
    }

    function getCodeStorage(uint id) public view returns (Storage) {
        // return tasks[id].code_storage;
    }
    */

    // The state here should be marked the same as 
    // This check shouldn't be needed unless there is a challenge, move it there
    /*
    function ensureInputFile(uint id, bytes32 state, bytes32[10] roots, uint[4] pointers, bytes32[] proof, uint file_num) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        require(t2.solver == 0);
        // check code
        require(roots[0] == t.init);
        require(state == iactive.calcStateHash(roots, pointers));
        require(iactive.checkFileProof(state, roots, pointers, proof, file_num));
        
        require(getRoot(t.input_file) == proof[1] || getRoot(t.input_file) == proof[0]);
        
        t2.good = true;
    }
    */

    function challenge(uint id) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        // VMParameters storage p = params[id];
        require(t.state == 1);
        bytes32 uniq = iactive.make(id, t2.solver, msg.sender, t.init, t2.result, 1, 10);
        challenges[uniq] = id;
        t2.challenges.push(uniq);
    }

    function challengeFinality(uint id) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        require(t.state == 1);
        bytes32 uniq = iactive.makeFinality(id, t2.solver, msg.sender, t.init, t2.result, /* t2.steps */ 100, 10);
        challenges[uniq] = id;
        t2.challenges.push(uniq);
    }

    function queryChallenge(bytes32 uniq) constant public returns (uint) {
        return challenges[uniq];
    }

    function getChallenges(uint id) public view returns (bytes32[]) {
        return tasks2[id].challenges;
    }

    function finalize(uint id, uint output, bytes32[10] roots, uint[4] pointers, bytes32[] proof, uint file_num) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        require(t.state == 1 && t2.blocked < block.number && !iactive.isRejected(id) && iactive.blockedTime(id) < block.number);
        t.state = 3;
        t2.output_file = bytes32(output);
        require(iactive.checkFileProof(t2.result, roots, pointers, proof, file_num));
        require(getRoot(output) == proof[1] || getRoot(output) == proof[0]);
        
        Callback(t.giver).solved(id, t2.result, t2.output_file);
    }
    
    // no output file
    function finalizeTask(uint id) public returns (bool) {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        if (!(t.state == 1 && t2.blocked < block.number && !iactive.isRejected(id) && iactive.blockedTime(id) < block.number)) return false;
        require(t.state == 1 && t2.blocked < block.number && !iactive.isRejected(id) && iactive.blockedTime(id) < block.number);
        t.state = 3;
        
        Finalized(id);
        return true;
    }
    
    uint tick_var;
    
    // For testing, mine this to create new block
    function tick() public {
        tick_var++;
    }

}

