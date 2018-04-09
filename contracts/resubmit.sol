pragma solidity ^0.4.16;

import "./DepositsManager.sol";

interface InteractiveI {
    function make(uint task_id, address p, address c, bytes32 s, bytes32 e, uint256 par, uint to) public returns (bytes32);
    function makeFinality(uint task_id, address p, address c, bytes32 s, bytes32 e, uint256 _steps, uint to) public returns (bytes32);
    
    function calcStateHash(bytes32[10] roots, uint[4] pointers) public returns (bytes32);
    function checkFileProof(bytes32 state, bytes32[10] roots, uint[4] pointers, bytes32[] proof, uint loc) public returns (bool);
    function checkProof(bytes32 hash, bytes32 root, bytes32[] proof, uint loc) public returns (bool);
    
    // Check if a task has been rejected
    function isRejected(uint id) public returns (bool);
    // Check if a task is blocked, returns the block when it can be accepted
    function blockedTime(uint id) public returns (uint);
    function getChallenger(bytes32 id) public returns (address);
    function getTask(bytes32 id) public view returns (uint);
    function deleteChallenge(bytes32 id) public;
}

interface Callback {
    function solved(uint id, bytes32[] files) public;
    function rejected(uint id) public;
}

interface FilesystemI {
  function getRoot(bytes32 id) public view returns (bytes32);
  function getNameHash(bytes32 id) public view returns (bytes32);
}

contract TasksResubmit is DepositsManager {

    uint constant DEPOSIT = 0.1 ether;
    uint constant DEPOSIT_PART = 0.01 ether;
    uint constant LIMIT = 20;

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

    InteractiveI iactive;
    FilesystemI fs;

    function TasksResubmit(address contr, address fs_addr) public {
        iactive = InteractiveI(contr);
        fs = FilesystemI(fs_addr);
    }

    function getInteractive() public view returns (address) {
        return address(iactive);
    }
    
    struct RequiredFile {
       bytes32 name_hash;
       Storage file_storage;
       bytes32 file_id;
    }

    struct IO {
       bytes32 name;
       bytes32 size;
       bytes32 data;
       
       RequiredFile[] uploads;
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

        bool good; // has the file been loaded
        uint blocked; // how long we have to wait to accept solution

        bytes32 challenge;
    }

    struct Task {
        address giver;
        bytes32 init; // includes code and input roots, the output should be similar
        string stor;
        
        CodeType code_type;
        Storage storage_type;
        
        uint state;
        uint task_id;
        uint deposit;
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
        t.task_id = id;
        t.deposit = 1;

        defaultParameters(id);
        Posted(msg.sender, init, ct, cs, stor, id);
        return id;
    }

    function addWithParameters(bytes32 init, CodeType ct, Storage cs, string stor, uint8 stack, uint8 mem, uint8 globals, uint8 table, uint8 call) public returns (uint) {
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
        t.task_id = id;
        t.deposit = 1;
        
        VMParameters storage param = params[id];
        param.stack_size = stack;
        param.memory_size = mem;
        param.globals_size = globals;
        param.table_size = table;
        param.call_size = call;
        Posted(msg.sender, init, ct, cs, stor, id);
        return id;
    }

    function resubmit(uint old_id) internal returns (uint) {
        uint id = tasks.length;
        Task storage t = tasks[old_id];

        if (t.deposit > LIMIT) {
            if (io_roots[old_id].uploads.length > 0) Callback(t.giver).rejected(t.task_id);
            return;
        }
        
        tasks.length++;
        tasks2.length++;
        params.length++;
        io_roots.length++;
        
        tasks[id] = tasks[old_id];
        tasks[id].deposit *= 2;
        tasks2[id] = tasks2[old_id];
        params[id] = params[old_id];
        io_roots[id] = io_roots[old_id];
        
        return id;
    }

    // Make sure they won't be required after the task has been posted already
    function requireFile(uint id, bytes32 hash, Storage st) public {
        IO storage io = io_roots[id];
        io.uploads.push(RequiredFile(hash, st, 0));
    }

    function getUploadNames(uint id) public view returns (bytes32[]) {
        RequiredFile[] storage lst = io_roots[id].uploads;
        bytes32[] memory arr = new bytes32[](lst.length);
        for (uint i = 0; i < arr.length; i++) arr[i] = lst[i].name_hash;
        return arr;
        
    }

    function getUploadTypes(uint id) public view returns (Storage[]) {
        RequiredFile[] storage lst = io_roots[id].uploads;
        Storage[] memory arr = new Storage[](lst.length);
        for (uint i = 0; i < arr.length; i++) arr[i] = lst[i].file_storage;
        return arr;
    }

    function taskInfo(uint unq) public view returns (address giver, bytes32 hash, CodeType ct, Storage cs, string stor, uint id) {
        Task storage t = tasks[unq];
        return (t.giver, t.init, t.code_type, t.storage_type, t.stor, unq);
    }

    function getVMParameters(uint id) public view returns (uint8 stack, uint8 mem, uint8 globals, uint8 table, uint8 call) {
        VMParameters storage param = params[id];
        stack = param.stack_size;
        mem = param.memory_size;
        globals = param.globals_size;
        table = param.table_size;
        call = param.call_size;
    }

    function nextTask() public view returns (uint) {
        return tasks.length;
    }

    function getSolver(uint id) public view returns (address) {
        return tasks2[id].solver;
    }

    function solveIO(uint id, bytes32 code, bytes32 size, bytes32 name, bytes32 data) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        IO storage io = io_roots[t.task_id];
        require(t2.solver == 0 && t2.good);
        
        io.size = size;
        io.name = name;
        io.data = data;
        t2.solver = msg.sender;
        t2.result = keccak256(code, size, name, data);
        t.state = 1;
        t2.blocked = block.number + 10;
        Solved(id, t2.result, t.init, t.code_type, t.storage_type, t.stor, t2.solver);
        subDeposit(msg.sender, DEPOSIT*t.deposit);
    }

    function solutionInfo(uint unq) public view returns (uint id, bytes32 hash, bytes32 init, CodeType ct, Storage cs, string stor, address solver) {
        Task storage t = tasks[unq];
        Task2 storage t2 = tasks2[unq];
        return (unq, t2.result, t.init, t.code_type, t.storage_type, t.stor, t2.solver);
    }

    /*
    function getCodeType(uint id) public view returns (CodeType) {
        return tasks[id].code_type;
    }

    function getCodeStorage(uint id) public view returns (Storage) {
        // return tasks[id].code_storage;
    }
    */

    function challenge(uint id) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        // VMParameters storage p = params[id];
        require(t.state == 1 && t2.challenge == 0);
        bytes32 uniq = iactive.make(id, t2.solver, msg.sender, t.init, t2.result, 1, 10);
        challenges[uniq] = id;
        t2.challenge = uniq;
        
        subDeposit(msg.sender, DEPOSIT*t.deposit);
        addDeposit(t.giver, DEPOSIT_PART*t.deposit); // rewarding task giver for delay
        addDeposit(t2.solver, DEPOSIT_PART*t.deposit);
        resubmit(id);
    }

    function challengeFinality(uint id) public {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        require(t.state == 1 && t2.challenge == 0);
        bytes32 uniq = iactive.makeFinality(id, t2.solver, msg.sender, t.init, t2.result, /* t2.steps */ 100, 10);
        challenges[uniq] = id;
        t2.challenge = uniq;
        
        subDeposit(msg.sender, DEPOSIT*t.deposit);
        addDeposit(t.giver, DEPOSIT_PART*t.deposit); // rewarding task giver for delay
        addDeposit(t2.solver, DEPOSIT_PART*t.deposit);
        resubmit(id);
    }

    function queryChallenge(bytes32 uniq) constant public returns (uint) {
        return challenges[uniq];
    }

    function getChallenges(uint id) public view returns (bytes32[]) {
        bytes32 chal = tasks2[id].challenge;
        bytes32[] memory res;
        if (chal == 0) {
            res = new bytes32[](0);
            return res;
        }
        res = new bytes32[](1);
        res[0] = chal;
        return res;
    }

    function uploadFile(uint id, uint num, bytes32 file_id, bytes32[] name_proof, bytes32[] data_proof, uint file_num) public returns (bool) {
        IO storage io = io_roots[id];
        RequiredFile storage file = io.uploads[num];
        if (!iactive.checkProof(fs.getRoot(file_id), io.data, data_proof, file_num) || !iactive.checkProof(fs.getNameHash(file_id), io.name, name_proof, file_num)) return false;
        require(iactive.checkProof(fs.getRoot(file_id), io.data, data_proof, file_num));
        require(iactive.checkProof(fs.getNameHash(file_id), io.name, name_proof, file_num));
        
        file.file_id = file_id;
        return true;
    }

    function finalizeTask(uint id) public returns (bool) {
        Task storage t = tasks[id];
        Task2 storage t2 = tasks2[id];
        IO storage io = io_roots[id];
        if (!(t.state == 1 && t2.blocked < block.number && t2.challenge != 0)) return false;
        t.state = 3;
        
        bytes32[] memory files = new bytes32[](io.uploads.length);
        for (uint i = 0; i < io.uploads.length; i++) {
           if (!(io.uploads[i].file_id != 0)) return false;
           require(io.uploads[i].file_id != 0);
           files[i] = io.uploads[i].file_id;
        }

        if (files.length > 0) Callback(t.giver).solved(t.task_id, files);
        
        Finalized(id);
        addDeposit(t2.solver, DEPOSIT*t.deposit);
        
        return true;
    }
    
    function claimDeposit(bytes32 cid) public {
        uint id = iactive.getTask(cid);
        Task storage t = tasks[id];
        require(iactive.isRejected(id));
        require(iactive.getChallenger(cid) == msg.sender);
        iactive.deleteChallenge(cid);
        addDeposit(msg.sender, (DEPOSIT+DEPOSIT_PART*2)*t.deposit);
    }

    uint tick_var;

    // For testing, mine this to create new block
    function tick() public {
        tick_var++;
    }

}



