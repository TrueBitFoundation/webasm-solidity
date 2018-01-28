
pragma solidity ^0.4.16;

interface Interactive {
    function make(uint task_id, address p, address c, bytes32 s, bytes32 e, uint256 par, uint to) public returns (bytes32);
    function makeFinality(uint task_id, address p, address c, bytes32 s, bytes32 e, uint256 _steps, uint to) public returns (bytes32);
    
    function calcStateHash(bytes32[10] roots, uint[4] pointers) public returns (bytes32);
    function checkFileProof(bytes32 state, bytes32[10] roots, uint[4] pointers, bytes32[] proof, uint loc) public returns (bool);
    function checkProof(bytes32 hash, bytes32 root, bytes32[] proof, uint loc) public returns (bool);
    
    // Check if a task has been rejected
    function isRejected(uint id) public returns (bool);
    // Check if a task is blocked, returns the block when it can be accepted
    function blockedTime(uint id) public returns (uint);
    function clock(bytes32 id) public returns (uint);
    function getWinner(bytes32 id) public view returns (address);
}

contract Parallel {

    uint nonce;
    
    Interactive normal;
    
    struct Record {
       uint clock;

       bytes32 init;
       uint init_size;
       bytes32 result;

       bytes32 root;
       bytes32 left;
       bytes32 right;
       address solver;
       address verifier;

       uint level;
       uint position;
       
       bytes32 sub_task;
    }

    mapping (bytes32 => Record) tasks;

    // Initializes a new custom verification game
    function init(bytes32 state, uint state_size, uint, uint, address solver, address verifier) public returns (bytes32) {
       nonce++;
       bytes32 id = keccak256(state, nonce);
       Record storage r = tasks[id];
       r.init = state;
       r.init_size = state_size;
       r.solver = solver;
       r.verifier = verifier;
       r.clock = block.number;

       return id;
    }

    function post(bytes32 id, bytes32 root) public {
       // Merkle root of results of the tasks
       Record storage r = tasks[id];
       require(msg.sender == r.solver && r.root == 0);
       r.result = r.root = root;
       r.clock = block.number;
    }

    function upload(bytes32 id, bytes32 root, bytes32 ll, bytes32 rl) public {
       Record storage r = tasks[id];
       require(msg.sender == r.solver && r.root == root && r.level % 2 == 0 && root != 0);
       r.left = ll;
       r.right = rl;
       r.level++;
       r.clock = block.number;
    }

    function select(bytes32 id, bytes32 root, bool lr) public {
       Record storage r = tasks[id];
       require(msg.sender == r.verifier && r.root == root && r.level % 2 == 1 && root != 0);
       r.root = lr ? r.left : r.right;
       r.level++;
       r.position = r.position * 2 + (lr ? 0 : 1);
       r.clock = block.number;
    }
    
    // Found the state where disagreement is
    function disagree(bytes32 id, bytes32 root, bytes32[] proof) public {
       Record storage r = tasks[id];
       require(msg.sender == r.verifier && r.root == root && r.level % 2 == 1 && root != 0);
       r.clock = block.number;
      
       // this root is the end state, claimed by the solver
       bytes32 initial = checkProof(r.init, proof, r.position);
       
       nonce++;
       r.sub_task = normal.make(nonce, r.solver, r.verifier, initial, root, 1, 10);
       
    }
    
    // Last time the task was updated
    function clock(bytes32 id) public returns (uint) {
       Record storage r = tasks[id];
       if (r.sub_task != 0) return normal.clock(r.sub_task);
       else return r.clock;
    }
    
    // Check if has resolved into correct state
    function resolved(bytes32 id, bytes32 state, uint reg) public view returns (bool) {
       Record storage r = tasks[id];
       require (r.result == state && reg == 0);
       if (r.sub_task != 0) {
          return normal.getWinner(r.sub_task) == r.solver;
       }
       if (r.level % 2 == 1 && block.number > r.clock + 10) return true;
       return false;
    }
    
    function checkProof(bytes32 root, bytes32[] proof, uint loc) internal pure returns (bytes32) {
        require(proof.length >= 2);
        bytes32 res = keccak256(proof[0], proof[1]);
        for (uint i = 2; i < proof.length; i++) {
            loc = loc/2;
            if (loc%2 == 0) res = keccak256(res, proof[i]);
            else res = keccak256(proof[i], res);
        }
        require(loc < 2 && res == root);
        return proof[loc%2];
    }

}
