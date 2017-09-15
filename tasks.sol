pragma solidity ^0.4.16;

interface Interactive {
    function make(address p, address c, bytes32 s, bytes32 e, uint256 steps,
        uint256 par, uint to) returns (bytes32);
}

contract Tasks {
    
    event Posted(address giver, bytes32 hash, string file, uint id);
    event Solved(uint id, bytes32 hash, uint steps, bytes32 init, string file);
    
    Interactive iactive;
    
    function Tasks(address contr) {
        iactive = Interactive(contr);
    }
    
    function getInteractive() returns (address) {
        return address(iactive);
    }
    
    struct Task {
        address giver;
        bytes32 init;
        string file;
        
        address solver;
        bytes32 result;
        uint steps;
    }
    
    Task[] public tasks;
    
    mapping (bytes32 => uint) challenges;
    
    function add(bytes32 init, string file) {
        tasks.push(Task(msg.sender, init, file, 0, 0, 0));
        Posted(msg.sender, init, file, tasks.length-1);
    }
    
    function solve(uint id, bytes32 result, uint steps) {
        require(tasks[id].solver == 0);
        tasks[id].solver = msg.sender;
        tasks[id].result = result;
        tasks[id].steps = steps;
        Solved(id, result, steps, tasks[id].init, tasks[id].file);
    }
    
    function challenge(uint id) {
        Task storage t = tasks[id];
        bytes32 uniq = iactive.make(t.solver, msg.sender, t.init, t.result, t.steps, 1, 10);
        challenges[uniq] = id;
    }
    
    function queryChallenge(bytes32 uniq) constant returns (uint) {
        return challenges[uniq];
    }

}

