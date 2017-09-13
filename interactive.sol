pragma solidity ^0.4.16;

// "12", "13", "121212", "23232323", 123, 12, 100

contract Interactive {
    address prover;
    address challenger;
    
    bytes32 start_state;
    bytes32 end_state;
    
    // Maybe number of steps should be finished
    uint256 steps;
    
    address winner;
    address next;
    
    uint256 size;
    uint256 timeout;
    uint256 clock;

    uint256 idx1;
    uint256 idx2;

    bytes32[] proof;
    bytes32[16] result;
    
    function Interactive(
        address p, address c, bytes32 s, bytes32 e, uint256 _steps,
        uint256 par, uint to) {
        prover = p;
        challenger = c;
        start_state = s;
        end_state = e;
        steps = _steps;
        size = par;
        if (size > steps - 2) size = steps-2;
        timeout = to;
        clock = block.number;
        next = prover;
        idx1 = 0;
        idx2 = steps-1;
        proof.length = steps;
    }

    function gameOver() {
        require(block.number >= clock + timeout);
        if (next == prover) winner = challenger;
        else winner = prover;
    }

    function report(bytes32[] arr) {
        require(size != 0 && arr.length == size &&
                msg.sender == prover && prover == next);
        clock = block.number;
        uint iter = (idx2-idx1-1)/size;
        for (uint i = 0; i < arr.length; i++) {
            proof[idx1+1+iter*i] = arr[i];
        }
        if (idx2-idx1-1 == 0) {
            size = 0;
        }
        else next = challenger;
    }

    function getStep(uint idx) returns (bytes32) {
        return proof[idx];
    }

    function query(uint num) {
        require(size != 0 && num <= size &&
                msg.sender == challenger && challenger == next);
        clock = block.number;
        uint iter = (idx2-idx1-1)/size;
        idx1 = idx1+1+iter*num;
        idx2 = idx1+iter;
        if (size > idx2-idx1-1) size = idx2-idx1-1;
        next = prover;
    }
    
    function microStep(bytes32[16] arr) {
        require(size == 0 && msg.sender == prover);
        result = arr;
    }
    
    function getResult() returns (bytes32[16]) {
        return result;
    }

}

