pragma solidity ^0.4.15;

import "./common-onchain.sol";

contract Judge is CommonOnchain {

    address winner;
    
    function judge(bytes32[13] res, uint q,
                        bytes32[] _proof, uint /* loc */, bytes32 fetched_op,
                        bytes32 vm_, bytes32 op, uint[4] regs,
                        bytes32[8] roots, uint[4] pointers) public returns (uint) {
        setMachine(vm_, op, regs[0], regs[1], regs[2], regs[3]);
        setVM2(roots, pointers);
        // m.vm = hashVM();
        if (q == 0 || q == 1) {
            m.vm = hashVM();
            state = hashMachine();
        }
        else state = res[q];
        phase = q;
        if (fetched_op != 0) m.op = fetched_op;
        proof = _proof;
        performPhase();
        // Special states
        if (q == 0) state = keccak256(m.vm, m.op);
        if (q == 11) state = m.vm;
        require (state == res[q+1]);
        winner = msg.sender;
        return q;
        // return (q, state, debug);
    }
}
