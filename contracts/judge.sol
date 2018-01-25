pragma solidity ^0.4.15;

import "./common-onchain.sol";

contract Judge is CommonOnchain {

    address winner;
    
    bytes32 mask = 0xffffffffffffffffffffffffffffffffffffffffffffffff;
    
    function checkProof(bytes32[] pr) internal view {
       require (pr.length == 0 || (pr.length != 1 && pr[0] == pr[0]&mask && pr[1] == pr[1]&mask));
    }

    function judgeCustom(bytes32 start, bytes32 next, bytes32 ex_state, uint ex_size, bytes32 op, uint[4] regs, bytes32[10] roots, uint[4] pointers, bytes32[] _proof) public {
         
         setVM(roots, pointers);
         setMachine(hashVM(), op, regs[0], regs[1], regs[2], regs[3]);
         proof = _proof;
         
         require(hashMachine() == start);
         require(getRoot(regs[0]) == vm_r.input_data);
         
         regs[1] = ex_size;
         // checkProof(_proof);
         setInputFile(regs[0], ex_state);
         
         m.vm = hashVM();
         require(hashMachine() == next);
    }

    function judge(bytes32[13] res, uint q,
                        bytes32[] _proof, bytes32[] _proof2,
                        bytes32 vm_, bytes32 op, uint[4] regs,
                        bytes32[10] roots, uint[4] pointers) public returns (uint) {
        setMachine(vm_, op, regs[0], regs[1], regs[2], regs[3]);
        setVM(roots, pointers);
        // Special initial state
        if (q == 0) {
            m.vm = hashVM();
            state = hashMachine();
            require(m.vm == res[q]);
        }
        else {
           state = res[q];
           require(state == hashMachine());
        }
        phase = q;
        checkProof(_proof);
        proof = _proof;
        proof2 = _proof2;
        performPhase();
        // Special final state
        if (q == 11) state = m.vm;
        require (state == res[q+1]);
        winner = msg.sender;
        return q;
        // return (q, state, debug);
    }

    function judgeFinality(bytes32[13] res, bytes32[] _proof, bytes32[] _proof2,
                        bytes32[10] roots, uint[4] pointers) public returns (uint) {
        setVM(roots, pointers);
        m.vm = hashVM();
        state = hashMachine();
        require(m.vm == res[0]);
        phase = 0;
        proof = _proof;
        proof2 = _proof2;
        checkProof(_proof);
        performPhase();
        require(m.op == 0x0000000000000000000000000000000000000000040006060001000106000000);
        return 1;
    }

    function checkFileProof(bytes32 state, bytes32[10] roots, uint[4] pointers, bytes32[] _proof, uint loc) public returns (bool) {
        setVM(roots, pointers);
        proof = _proof;
        return state == calcIOHash(roots) && vm_r.input_data == getRoot(loc);
    }

    function checkProof(bytes32 hash, bytes32 root, bytes32[] _proof, uint loc) public returns (bool) {
        proof = _proof;
        return uint(hash) == getLeaf(loc) && root == getRoot(loc);
    }

    function calcStateHash(bytes32[10] roots, uint[4] pointers) public returns (bytes32) {
        setVM(roots, pointers);
        return hashVM();
    }

    function calcIOHash(bytes32[10] roots) public pure returns (bytes32) {
        return keccak256(roots[0], roots[7], roots[8], roots[9]);
    }

}
