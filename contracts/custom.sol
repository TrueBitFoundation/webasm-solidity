pragma solidity ^0.4.19;

// generic custom instruction, have like 4 arguments, one result
contract GenericCustom {

    function dataMerkle(bytes32[] ctrl, uint idx, uint level) internal pure returns (bytes32) {
       if (level == 0) {
           if (idx < ctrl.length) {
               // get the element
               bytes32 elem = ctrl[idx];
               return keccak256(bytes16(elem), uint128(elem));
           }
           else return keccak256(bytes16(0), bytes16(0));
       }
       else return keccak256(dataMerkle(ctrl, idx, level-1), dataMerkle(ctrl, idx+(2**(level-1)), level-1));
    }

    struct Task {
      bytes32 initial_state;
      address solver;
      uint clock;
      bytes32 result;
    }

    mapping (bytes32 => Task) tasks;

    event AddedObligation(bytes32 id, bytes32 state, address solver);

    // Initializes a new custom verification game
    function init(bytes32 state, uint /* state_size */, uint /* r3 */, address solver, address /* verifier */) public returns (bytes32) {
       bytes32 id = keccak256(state, solver);
       Task storage t = tasks[id];
       t.initial_state = state;
       t.solver = solver;
       t.clock = block.number;
       AddedObligation(id, state, solver);
       return id;
    }

    // Last time the task was updated
    function clock(bytes32 id) public view returns (uint) {
        return tasks[id].clock;
    }

    // Check if has resolved into correct state: merkle root of output data and output size
    function resolved(bytes32 id, bytes32 state, uint size) public view returns (bool) {
       Task storage t = tasks[id];
       bytes32 zero = keccak256(bytes16(0), bytes16(0));
       bytes32 leaf = keccak256(bytes16(t.result), uint128(t.result));
       return size == 32 && state == keccak256(keccak256(leaf, zero), keccak256(zero, zero));
    }

    function submitProof(bytes32 id, bytes32[] args, uint sz) public {
       Task storage t = tasks[id];
       require(msg.sender == t.solver);
       bytes32 input = dataMerkle(args, 0, sz);
       require(input == t.initial_state);
       t.result = work(args);
    }
    
    function work(bytes32[] args) public returns (bytes32);

}

