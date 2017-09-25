pragma solidity ^0.4.15;

import "alu.sol";

contract Instruction is ALU {

    bytes32[13] phases;
    address challenger;
    address prover;
    uint init;
    address winner;

    function setup(bytes32[13] arr, address c, address p, uint i) internal {
        phases = arr;
        challenger = c;
        prover = p;
        init = i;
        winner = challenger;
    }
    
    struct Roots {
        bytes32 code;
        bytes32 stack;
        bytes32 mem;
        bytes32 globals;
        bytes32 calltable;
        bytes32 calltypes;
        bytes32 call_stack;
        bytes32 input;
    }

    struct VM {
        uint pc;
        uint stack_ptr;
        uint call_ptr;
        uint memsize;
    }
    
    VM vm;
    Roots vm_r;

    struct Machine {
        bytes32 vm;
        bytes32 op;
        uint reg1;
        uint reg2;
        uint reg3;
        uint ireg;
    }
    
    function setVM2(bytes32[8] roots, uint[4] pointers) internal {
        require(msg.sender == prover);
        vm_r.code = roots[0];
        vm_r.stack = roots[1];
        vm_r.mem = roots[2];
        vm_r.call_stack = roots[3];
        vm_r.globals = roots[4];
        vm_r.calltable = roots[5];
        vm_r.calltypes = roots[6];
        vm_r.input = roots[7];

        vm.pc = pointers[0];
        vm.stack_ptr = pointers[1];
        vm.call_ptr = pointers[2];
        vm.memsize = pointers[3];
    }
    
    function hashVM() internal view returns (bytes32) {
        bytes32[] memory arr = new bytes32[](12);
        arr[0] = vm_r.code;
        arr[1] = vm_r.mem;
        arr[2] = vm_r.stack;
        arr[3] = vm_r.globals;
        arr[4] = vm_r.call_stack;
        arr[5] = vm_r.calltable;
        arr[6] = vm_r.calltypes;
        arr[7] = vm_r.input;
        arr[8] = bytes32(vm.pc);
        arr[9] = bytes32(vm.stack_ptr);
        arr[10] = bytes32(vm.call_ptr);
        arr[11] = bytes32(vm.memsize);
        return keccak256(arr);
    }
    
    Machine m;
    
    function setMachine(
        bytes32 vm_,
        bytes32 op,
        uint reg1,
        uint reg2,
        uint reg3,
        uint ireg) internal {
        m.vm = vm_;
        m.op = op;
        m.reg1 = reg1;
        m.reg2 = reg2;
        m.reg3 = reg3;
        m.ireg = ireg;
    }
    
    function hashMachine() internal view returns (bytes32) {
        return keccak256(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg);
    }
    
    function getLeaf(bytes32[] proof, uint loc) internal pure returns (bytes32) {
        require(proof.length >= 2);
        if (loc%2 == 0) return proof[0];
        else return proof[1];
    }
    
    function getRoot(bytes32[] proof, uint loc) internal pure returns (bytes32) {
        require(proof.length >= 2);
        bytes32 res = keccak256(proof[0], proof[1]);
        for (uint i = 2; i < proof.length; i++) {
            loc = loc/2;
            if (loc%2 == 0) res = keccak256(res, proof[i]);
            else res = keccak256(proof[i], res);
        }
        require(loc < 2);
        return res;
    }

    function proveFetch(bytes32[] proof) internal returns (bool) {
        require(init == 0 && msg.sender == prover);
        bytes32 state1 = phases[0];
        bytes32 state2 = phases[1];
        bytes32 op = getLeaf(proof, vm.pc);
        require(state1 == hashVM());
        require(state2 == keccak256(state1, op));
        require(vm_r.code == getRoot(proof, vm.pc));
        winner = prover;
        return true;
    }

    function getImmed(bytes32 op) internal pure returns (uint256) {
        // it is the first 8 bytes
        return uint(op)/(2**(13*8));
    }

    function proveInit(bytes32 op) internal returns (bool) {
        require(init == 1 && msg.sender == prover);
        bytes32 state1 = phases[1];
        bytes32 state2 = phases[2];
        m.vm = hashVM();
        m.op = op;
        m.reg1 = 0;
        m.reg2 = 0;
        m.reg3 = 0;
        m.ireg = getImmed(op);
        require(state1 == keccak256(m.vm, op));
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    
    function readPosition(uint hint) internal view returns (uint) {
        assert(hint > 4);
        if (hint == 5) return m.reg1;
        else if (hint == 6) return vm.stack_ptr-1;
        else if (hint == 7) return vm.stack_ptr-2;
        else if (hint == 8) return vm.stack_ptr-m.reg1; // Stack in reg
        else if (hint == 9) return vm.stack_ptr-m.reg2;
        else if (hint == 14) return vm.call_ptr-1;
        else if (hint == 15) return (m.reg1+m.ireg)/8;
        else if (hint == 16) return m.reg1;
        else if (hint == 17) return (m.reg1+m.ireg)/8 + 1;
        else if (hint == 18) return m.reg1;
        else if (hint == 19) return m.reg1;
    }

    function writePosition(uint hint) internal view returns (uint) {
        assert(hint > 0);
        if (hint == 2) return vm.stack_ptr-m.reg1;
        else if (hint == 3) return vm.stack_ptr;
        else if (hint == 4) return vm.stack_ptr-1;
        else if (hint == 5) return m.reg1+m.reg2;
        else if (hint == 6) return vm.call_ptr;
        else if (hint == 8) return m.reg1;
        else if (hint == 9) return vm.stack_ptr-2;
        else if (hint & 0xc0 == 0x80) return (m.reg1+m.ireg)/8;
        else if (hint & 0xc0 == 0xc0) return (m.reg1+m.ireg)/8 + 1;
    }

    function readRoot(uint hint) internal view returns (bytes32) {
        assert(hint > 4);
        if (hint == 5) return vm_r.globals;
        else if (hint == 6) return vm_r.stack;
        else if (hint == 7) return vm_r.stack;
        else if (hint == 8) return vm_r.stack;
        else if (hint == 9) return vm_r.stack;
        else if (hint == 14) return vm_r.call_stack;
        else if (hint == 15) return vm_r.mem;
        else if (hint == 16) return vm_r.calltable;
        else if (hint == 17) return vm_r.mem;
        else if (hint == 18) return vm_r.calltypes;
        else if (hint == 19) return vm_r.input;
    }
    
    function writeRoot(uint hint) internal view returns (bytes32) {
        assert(hint > 0);
        if (hint == 2) return vm_r.stack;
        else if (hint == 3) return vm_r.stack;
        else if (hint == 4) return vm_r.stack;
        else if (hint == 5) return vm_r.mem;
        else if (hint == 6) return vm_r.call_stack;
        else if (hint == 8) return vm_r.globals;
        else if (hint == 9) return vm_r.stack;
        else return vm_r.mem;
    }
    
    function checkReadProof(bytes32[] proof, uint loc, uint hint) internal view returns (bool) {
        if (hint <= 4) return true;
        return readPosition(hint) == loc && readRoot(hint) == getRoot(proof, loc);
    }
    
    function checkWriteProof(bytes32[] proof, uint loc, uint hint) internal view returns (bool) {
        if (hint == 0) return true;
        return writePosition(hint) == loc && writeRoot(hint) == getRoot(proof, loc);
    }
    
    function readFromProof(bytes32[] proof, uint loc, uint hint) internal view returns (uint) {
        if (hint == 0) return 0;
        if (hint == 1) return m.ireg;
        if (hint == 2) return vm.pc+1;
        if (hint == 3) return vm.stack_ptr;
        if (hint == 4) return vm.memsize;
        return uint(getLeaf(proof, loc));
    }
    
    function proveRead1(bytes32[] proof, uint loc) internal returns (bool) {
        require(init == 2 && msg.sender == prover);
        bytes32 state1 = phases[2];
        bytes32 state2 = phases[3];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*0))&0xff;
        require(checkReadProof(proof, loc, hint));
        m.reg1 = readFromProof(proof, loc, hint);
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveRead2(bytes32[] proof, uint loc) internal returns (bool) {
        require(init == 3 && msg.sender == prover);
        bytes32 state1 = phases[3];
        bytes32 state2 = phases[4];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*1))&0xff;
        require(checkReadProof(proof, loc, hint));
        m.reg2 = readFromProof(proof, loc, hint);
        // debug = hint;
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveRead3(bytes32[] proof, uint loc) internal returns (bool) {
        require(init == 4 && msg.sender == prover);
        bytes32 state1 = phases[4];
        bytes32 state2 = phases[5];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*2))&0xff;
        require(checkReadProof(proof, loc, hint));
        m.reg3 = readFromProof(proof, loc, hint);
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    
    function proveALU() internal returns (uint) {
        require(init == 5 && msg.sender == prover);
        bytes32 state1 = phases[5];
        bytes32 state2 = phases[6];
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*3))&0xff;
        // m.reg1 = ALU.handleALU(hint, m.reg1, m.reg2, m.reg3, m.ireg);
        m.reg1 = handleALU(hint, m.reg1, m.reg2, m.reg3, m.ireg);
        require(state2 == hashMachine());
        winner = prover;
        return debug;
    }
    
    function makeChange(bytes32[] proof, uint loc, uint v) internal pure returns (bytes32) {
        assert(proof.length >= 2);
        if (loc%2 == 0) proof[0] = bytes32(v);
        else proof[1] = bytes32(v);
        return getRoot(proof, loc);
    }

    uint debug;

    function makeMemChange1(bytes32[] proof, uint loc, uint v, uint hint) internal view returns (bytes32) {
        assert(proof.length >= 2);
        
        uint old = uint(getLeaf(proof, loc));
        uint8[] memory mem = toMemory(old, 0);
        storeX(mem, (m.reg1+m.ireg)%8, v, hint);
        uint res; uint extra;
        (res, extra) = fromMemory(mem);
        
        if (loc%2 == 0) proof[0] = bytes32(res);
        else proof[1] = bytes32(res);
        return getRoot(proof, loc);
    }
    
    function makeMemChange2(bytes32[] proof, uint loc, uint v, uint hint) internal view returns (bytes32) {
        assert(proof.length >= 2);
        
        uint old = uint(getLeaf(proof, loc));
        uint8[] memory mem = toMemory(0, old);
        storeX(mem, (m.reg1+m.ireg)%8, v, hint);
        uint res; uint extra;
        (extra, res) = fromMemory(mem);
        
        if (loc%2 == 0) proof[0] = bytes32(res);
        else proof[1] = bytes32(res);
        return getRoot(proof, loc);
    }
    
    function writeStuff(uint hint, bytes32[] proof, uint loc, uint v) internal {
        if (hint == 0) return;
        bytes32 root;
        if (hint & 0xc0 == 0x80) root = makeMemChange1(proof, loc, v, hint);
        else if (hint & 0xc0 == 0xc0) root = makeMemChange2(proof, loc, v, hint);
        else root = makeChange(proof, loc, v);
        
        if (hint == 2) vm_r.stack = root;
        else if (hint == 3) vm_r.stack = root;
        else if (hint == 4) vm_r.stack = root;
        else if (hint == 5) vm_r.mem = root;
        else if (hint == 6) vm_r.call_stack = root;
        else if (hint == 8) vm_r.globals = root;
        else if (hint == 9) vm_r.stack = root;
        else vm_r.mem = root;
    }
    
    function proveWrite1(bytes32[] proof, uint loc) internal returns (uint) {
        require(init == 6 && msg.sender == prover);
        bytes32 state1 = phases[6];
        bytes32 state2 = phases[7];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint target = (uint(m.op)/2**(8*4))&0xff;
        uint hint = (uint(m.op)/2**(8*5))&0xff;
        debug = hint;
        require(checkWriteProof(proof, loc, hint));
        uint v;
        if (target == 1) v = m.reg1;
        if (target == 2) v = m.reg2;
        if (target == 3) v = m.reg3;
        writeStuff(hint, proof, loc, v);
        
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return debug;
    }
    function proveWrite2(bytes32[] proof, uint loc) internal returns (bool) {
        require(init == 7 && msg.sender == prover);
        bytes32 state1 = phases[7];
        bytes32 state2 = phases[8];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint target = (uint(m.op)/2**(8*6))&0xff;
        uint hint = (uint(m.op)/2**(8*7))&0xff;
        debug = hint;
        require(checkWriteProof(proof, loc, hint));
        
        uint v;
        if (target == 1) v = m.reg1;
        if (target == 2) v = m.reg2;
        if (target == 3) v = m.reg3;
        writeStuff(hint, proof, loc, v);
        
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    
    function handlePointer(uint hint, uint ptr) internal view returns (uint) {
        if (hint == 0) return ptr - m.reg1;
        else if (hint == 1) return m.reg1;
        else if (hint == 2) return m.reg2;
        else if (hint == 3) return m.reg3;
        else if (hint == 4) return ptr+1;
        else if (hint == 5) return ptr-1;
        else if (hint == 6) return ptr;
        else if (hint == 7) return ptr-2;
        else if (hint == 8) return ptr-1-m.ireg;
    }

    function proveUpdatePC() internal returns (bool) {
        require(init == 8 && msg.sender == prover);
        bytes32 state1 = phases[8];
        bytes32 state2 = phases[9];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*11))&0xff;
        vm.pc = handlePointer(hint, vm.pc);
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveUpdateStackPtr() internal returns (bool) {
        require(init == 9 && msg.sender == prover);
        bytes32 state1 = phases[9];
        bytes32 state2 = phases[10];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*9))&0xff;
        vm.stack_ptr = handlePointer(hint, vm.stack_ptr);
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveUpdateCallPtr() internal returns (bool) {
        require(init == 10 && msg.sender == prover);
        bytes32 state1 = phases[10];
        bytes32 state2 = phases[11];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*8))&0xff;
        vm.call_ptr = handlePointer(hint, vm.call_ptr);
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveUpdateMemsize() internal returns (bool) {
        require(init == 11 && msg.sender == prover);
        bytes32 state1 = phases[11];
        bytes32 state2 = phases[12];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*12))&0xff;
        if (hint == 1) vm.memsize = vm.memsize+m.reg1;
        m.vm = hashVM();
        require(state2 == hashVM());
        winner = prover;
        return true;
    }
    
    function provePhase(bytes32[] proof, uint loc, bytes32 op) internal {
        if (init == 0) proveFetch(proof);
        if (init == 1) proveInit(op);
        if (init == 2) proveRead1(proof, loc);
        if (init == 3) proveRead2(proof, loc);
        if (init == 4) proveRead3(proof, loc);
        if (init == 5) proveALU();
        if (init == 6) proveWrite1(proof, loc);
        if (init == 7) proveWrite2(proof, loc);
        if (init == 8) proveUpdatePC();
        if (init == 9) proveUpdateStackPtr();
        if (init == 10) proveUpdateCallPtr();
        if (init == 11) proveUpdateMemsize();
    }
    
    function judge(bytes32[13] res, uint q,
                        bytes32[] proof, uint loc, bytes32 fetched_op,
                        bytes32 vm_, bytes32 op, uint[4] regs,
                        bytes32[8] roots, uint[4] pointers) public returns (uint) {
        setup(res,msg.sender,msg.sender,q);
        setMachine(vm_, op, regs[0], regs[1], regs[2], regs[3]);
        setVM2(roots, pointers);
        provePhase(proof, loc, fetched_op);
        return debug;
    }

}
