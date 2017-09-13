pragma solidity ^0.4.15;

// import "./alu.sol";

contract Instruction {

    bytes32[14] phases;
    address challenger;
    address prover;
    uint init;
    address winner;

    function setup(bytes32[14] arr, address c, address p, uint i) {
        phases = arr;
        challenger = c;
        prover = p;
        init = i;
        winner = challenger;
    }

    struct VM {
        bytes32 code;
        bytes32 stack;
        bytes32 mem;
        bytes32 break_stack1;
        bytes32 break_stack2;
        bytes32 globals;
        bytes32 calltable;
        bytes32 call_stack;
        
        uint pc;
        uint stack_ptr;
        uint break_ptr;
        uint call_ptr;
        uint memsize;
    }
    
    VM vm;
    
    struct Machine {
        bytes32 vm;
        bytes32 op;
        uint reg1;
        uint reg2;
        uint reg3;
        uint ireg;
    }
    
    function setVM(
        bytes32 code,
        bytes32 stack,
        bytes32 mem,
        bytes32 break_stack1,
        bytes32 break_stack2,
        bytes32 globals,
        bytes32 call_stack,
        bytes32 calltable,
        
        uint pc,
        uint stack_ptr,
        uint break_ptr,
        uint call_ptr,
        uint memsize) {
        require(msg.sender == prover);
        vm.code = code;
        vm.stack = stack;
        vm.mem = mem;
        vm.call_stack = call_stack;
        vm.break_stack1 = break_stack1;
        vm.break_stack2 = break_stack2;
        vm.globals = globals;
        vm.calltable = calltable;
        vm.pc = pc;
        vm.stack_ptr = stack_ptr;
        vm.break_ptr = break_ptr;
        vm.call_ptr = call_ptr;
        vm.memsize = memsize;
    }
    
    function setVM2(bytes32[8] roots, uint[5] pointers) {
        require(msg.sender == prover);
        vm.code = roots[0];
        vm.stack = roots[1];
        vm.mem = roots[2];
        vm.call_stack = roots[3];
        vm.break_stack1 = roots[4];
        vm.break_stack2 = roots[5];
        vm.globals = roots[6];
        vm.calltable = roots[7];

        vm.pc = pointers[0];
        vm.stack_ptr = pointers[1];
        vm.break_ptr = pointers[2];
        vm.call_ptr = pointers[3];
        vm.memsize = pointers[4];
    }
    
    function hashVM() returns (bytes32) {
        return sha3(vm.code, vm.mem, vm.stack, vm.globals, vm.call_stack, vm.break_stack1,
                    vm.break_stack2, vm.calltable,
                    vm.pc, vm.stack_ptr, vm.call_ptr, vm.break_ptr, vm.memsize);
    }
    
    Machine m;
    
    function setMachine(
        bytes32 vm_,
        bytes32 op,
        uint reg1,
        uint reg2,
        uint reg3,
        uint ireg) {
        m.vm = vm_;
        m.op = op;
        m.reg1 = reg1;
        m.reg2 = reg2;
        m.reg3 = reg3;
        m.ireg = ireg;
    }
    
    function hashMachine() returns (bytes32) {
        return sha3(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg);
    }
    
    function getLeaf(bytes32[] proof, uint loc) returns (bytes32) {
        require(proof.length >= 2);
        if (loc%2 == 0) return proof[0];
        else return proof[1];
    }
    
    function getRoot(bytes32[] proof, uint loc) returns (bytes32) {
        require(proof.length >= 2);
        bytes32 res = sha3(proof[0], proof[1]);
        for (uint i = 2; i < proof.length; i++) {
            loc = loc/2;
            if (loc%2 == 0) res = sha3(res, proof[i]);
            else res = sha3(proof[i], res);
        }
        return res;
    }

    function proveFetch(bytes32[] proof) returns (bool) {
        require(init == 0 && msg.sender == prover);
        bytes32 state1 = phases[0];
        bytes32 state2 = phases[1];
        bytes32 op = getLeaf(proof, vm.pc);
        require(state1 == hashVM());
        require(state2 == sha3(state1, op));
        require(vm.code == getRoot(proof, vm.pc));
        winner = prover;
        return true;
    }

    function getImmed(bytes32 op) internal returns (uint256) {
        // it is the first 8 bytes
        return uint(op)/(2**(13*8));
    }

    function proveInit(bytes32 op) returns (bool) {
        require(init == 1 && msg.sender == prover);
        bytes32 state1 = phases[1];
        bytes32 state2 = phases[2];
        m.vm = hashVM();
        m.op = op;
        m.reg1 = 0;
        m.reg2 = 0;
        m.reg3 = 0;
        m.ireg = getImmed(op);
        require(state1 == sha3(m.vm, op));
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    
    function readPosition(uint hint) returns (uint) {
        assert(hint > 4);
        if (hint == 5) return m.reg1;
        else if (hint == 6) return vm.stack_ptr-1;
        else if (hint == 7) return vm.stack_ptr-2;
        else if (hint == 8) return vm.stack_ptr-m.reg1; // Stack in reg
        else if (hint == 9) return vm.stack_ptr-m.reg2;
        else if (hint == 10) return vm.break_ptr-1;
        else if (hint == 11) return vm.break_ptr-1;
        else if (hint == 12) return vm.break_ptr-1-m.reg1;
        else if (hint == 13) return vm.break_ptr-1-m.reg1;
        else if (hint == 14) return vm.call_ptr-1;
        else if (hint == 15) return (m.reg1+m.ireg)/8;
        else if (hint == 16) return m.reg1;
        else if (hint == 17) return (m.reg1+m.ireg)/8 + 1;
    }

    function writePosition(uint hint) returns (uint) {
        assert(hint > 1);
        if (hint == 1) return vm.break_ptr;
        else if (hint == 2) return vm.stack_ptr-m.reg1;
        else if (hint == 3) return vm.stack_ptr;
        else if (hint == 4) return vm.stack_ptr-1;
        else if (hint == 5) return m.reg1+m.reg2;
        else if (hint == 6) return vm.call_ptr;
        else if (hint == 7) return vm.break_ptr;
        else if (hint == 8) return m.reg1;
        else if (hint == 9) return vm.stack_ptr-2;
        else if (hint & 0xc0 == 0x80) return (m.reg1+m.ireg)/8;
        else if (hint & 0xc0 == 0xc0) return (m.reg1+m.ireg)/8 + 1;
    }

    function readRoot(uint hint) returns (bytes32) {
        assert(hint > 4);
        if (hint == 5) return vm.globals;
        else if (hint == 6) return vm.stack;
        else if (hint == 7) return vm.stack;
        else if (hint == 8) return vm.stack;
        else if (hint == 9) return vm.stack;
        else if (hint == 10) return vm.break_stack1;
        else if (hint == 11) return vm.break_stack2;
        else if (hint == 12) return vm.break_stack1;
        else if (hint == 13) return vm.break_stack2;
        else if (hint == 14) return vm.call_stack;
        else if (hint == 15) return vm.mem;
        else if (hint == 16) return vm.calltable;
        else if (hint == 17) return vm.mem;
    }
    
    function writeRoot(uint hint) returns (bytes32) {
        assert(hint > 1);
        if (hint == 1) return vm.break_stack1;
        else if (hint == 2) return vm.stack;
        else if (hint == 3) return vm.stack;
        else if (hint == 4) return vm.stack;
        else if (hint == 5) return vm.mem;
        else if (hint == 6) return vm.call_stack;
        else if (hint == 7) return vm.break_stack2;
        else if (hint == 8) return vm.globals;
        else if (hint == 9) return vm.stack;
        else return vm.mem;
    }
    
    function checkReadProof(bytes32[] proof, uint loc, uint hint) returns (bool) {
        if (hint <= 4) return true;
        return readPosition(hint) == loc && readRoot(hint) == getRoot(proof, loc);
    }
    
    function checkWriteProof(bytes32[] proof, uint loc, uint hint) returns (bool) {
        if (hint == 0) return true;
        return writePosition(hint) == loc && writeRoot(hint) == getRoot(proof, loc);
    }
    
    function readFromProof(bytes32[] proof, uint loc, uint hint) returns (uint) {
        if (hint == 0) return 0;
        if (hint == 1) return m.ireg;
        if (hint == 2) return vm.pc+1;
        if (hint == 3) return vm.memsize;
        if (hint == 4) return vm.stack_ptr;
        return uint(getLeaf(proof, loc));
    }
    
    function proveRead1(bytes32[] proof, uint loc) returns (bool) {
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
    function proveRead2(bytes32[] proof, uint loc) returns (bool) {
        require(init == 3 && msg.sender == prover);
        bytes32 state1 = phases[3];
        bytes32 state2 = phases[4];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*1))&0xff;
        require(checkReadProof(proof, loc, hint));
        m.reg2 = readFromProof(proof, loc, hint);
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveRead3(bytes32[] proof, uint loc) returns (bool) {
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
    function handleALU(uint hint, uint r1, uint r2, uint r3, uint ireg) returns (uint) {
        uint res;
        if (hint == 0) return r1;
        else if (hint == 1) revert(); // Trap
        // Loading from memory
        else if (hint & 0xc0 == 0xc0) {
            uint8[] memory arr = toMemory(r2, r3);
            res = loadX(arr, (r1+ireg)%8, hint);
        }
        else if (hint == 2) {
            if (r1 < r2) res = r1;
            else res = r2;
        }
        else if (hint == 3) {
            if (r1 == 0) res = r2;
            else res = r3;
        }
        else if (hint == 4) {
            res = r1 + r2;
        }
        else if (hint == 5) {
            res = r1 + r2 - 1;
        }
        else if (hint == 0x45 || hint == 0x50) {
            if (r1 == 0) res = 1;
            else res = 0;
        }
        else if (hint == 0x46 || hint == 0x51) {
            if (r1 == r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x47 || hint == 0x52) {
            if (r1 == r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x48) {
            if (int32(r1) < int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x49) {
            if (uint32(r1) < uint32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4a) {
            if (int32(r1) > int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4b) {
            if (uint32(r1) > uint32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4c) {
            if (int32(r1) <= int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4d) {
            if (uint32(r1) <= uint32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4e) {
            if (int32(r1) >= int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4f) {
            if (uint32(r1) >= uint32(r2)) res = 0;
            else res = 1;
        }

        else if (hint == 0x53) {
            if (int64(r1) < int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x54) {
            if (uint64(r1) < uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x55) {
            if (int64(r1) > int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x56) {
            if (uint64(r1) > uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x57) {
            if (int64(r1) <= int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x58) {
            if (uint64(r1) <= uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x59) {
            if (int64(r1) >= int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x5a) {
            if (uint64(r1) >= uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x67) {
            // clz: count leading zeros 32
        }
        else if (hint == 0x68) {
            // ctz: count trailing zeros 32
        }
        else if (hint == 0x69) {
            // popcnt: count ones 32
        }
        else if (hint == 0x79) {
            // clz: count leading zeros 64
        }
        else if (hint == 0x7a) {
            // ctz: count trailing zeros 64
        }
        else if (hint == 0x7b) {
            // popcnt: count ones 64
        }
        else if (hint == 0x6a || hint == 0x7c) {
            res = r1+r2;
        }
        else if (hint == 0x6b || hint == 0x7d) {
            res = r1-r2;
        }
        else if (hint == 0x6c || hint == 0x7e) {
            res = r1*r2;
        }
        else if (hint == 0x6d) {
            res = uint(int32(r1)/int32(r2));
        }
        else if (hint == 0x7f) {
            res = uint(int64(r1)/int64(r2));
        }
        else if (hint == 0x6e || hint == 0x80) {
            res = r1/r2;
        }
        else if (hint == 0x6f) {
            res = uint(int32(r1)%int32(r2));
        }
        else if (hint == 0x81) {
            res = uint(int64(r1)%int64(r2));
        }
        else if (hint == 0x70 || hint == 0x82) {
            res = r1%r2;
        }
        else if (hint == 0x71 || hint == 0x83) {
            res = r1&r2;
        }
        else if (hint == 0x72 || hint == 0x84) {
            res = r1|r2;
        }
        else if (hint == 0x73 || hint == 0x85) {
            res = r1^r2;
        }
        else if (hint == 0x74 || hint == 0x86) {
            res = r1*2**r2; // shift 
        }
        else if (hint == 0x75 || hint == 0x87) {
            res = r1/2**r2;
        }
        else if (hint == 0x76 || hint == 0x88) {
            res = r1/2**r2;
        }
        // rol, ror
        else if (hint == 0x77) {
            res = (r1*2**r2) | (r1/2**32);
        }
        else if (hint == 0x78) {
            res = (r1/2**r2) | (r1*2**32);
        }
        else if (hint == 0x89) {
            res = (r1*2**r2) | (r1/2**64);
        }
        else if (hint == 0x8a) {
            res = (r1/2**r2) | (r1*2**64);
        }
        
        if (hint >= 0x62 && hint <= 0x78) {
            res = res % (2**32);
        }
        else if (hint >= 0x7c && hint <= 0x8a) {
            res = res % (2**64);
        }
        
        return res;
    }
    
    function proveALU() returns (uint) {
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
    
    function makeChange(bytes32[] proof, uint loc, uint v) returns (bytes32) {
        assert(proof.length >= 2);
        if (loc%2 == 0) proof[0] = bytes32(v);
        else proof[1] = bytes32(v);
        return getRoot(proof, loc);
    }

    uint debug;

    function makeMemChange1(bytes32[] proof, uint loc, uint v, uint hint) returns (bytes32) {
        assert(proof.length >= 2);
        
        uint old = uint(getLeaf(proof, loc));
        uint8[] memory mem = toMemory(old, 0);
        storeX(mem, (m.reg1+m.ireg)%8, v, hint);
        uint res; uint extra;
        (res, extra) = fromMemory(mem);
        debug = res;
        
        if (loc%2 == 0) proof[0] = bytes32(res);
        else proof[1] = bytes32(res);
        return getRoot(proof, loc);
    }
    
    function makeMemChange2(bytes32[] proof, uint loc, uint v, uint hint) returns (bytes32) {
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
    
    function writeStuff(uint hint, bytes32[] proof, uint loc, uint v) {
        if (hint == 0) return;
        bytes32 root;
        if (hint & 0xc0 == 0x80) root = makeMemChange1(proof, loc, v, hint);
        else if (hint & 0xc0 == 0xc0) root = makeMemChange2(proof, loc, v, hint);
        else root = makeChange(proof, loc, v);
        
        if (hint == 1) vm.break_stack1 = root;
        else if (hint == 2) vm.stack = root;
        else if (hint == 3) vm.stack = root;
        else if (hint == 4) vm.stack = root;
        else if (hint == 5) vm.mem = root;
        else if (hint == 6) vm.call_stack = root;
        else if (hint == 7) vm.break_stack2 = root;
        else if (hint == 8) vm.globals = root;
        else if (hint == 9) vm.stack = root;
        else vm.mem = root;
    }
    
    function proveWrite1(bytes32[] proof, uint loc) returns (uint) {
        require(init == 6 && msg.sender == prover);
        bytes32 state1 = phases[6];
        bytes32 state2 = phases[7];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint target = (uint(m.op)/2**(8*4))&0xff;
        uint hint = (uint(m.op)/2**(8*5))&0xff;
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
    function proveWrite2(bytes32[] proof, uint loc) returns (bool) {
        require(init == 7 && msg.sender == prover);
        bytes32 state1 = phases[7];
        bytes32 state2 = phases[8];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint target = (uint(m.op)/2**(8*6))&0xff;
        uint hint = (uint(m.op)/2**(8*7))&0xff;
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
    
    function handlePointer(uint hint, uint ptr) returns (uint) {
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

    function proveUpdatePC() returns (bool) {
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
    function proveUpdateBreakPtr() returns (bool) {
        require(init == 9 && msg.sender == prover);
        bytes32 state1 = phases[9];
        bytes32 state2 = phases[10];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*10))&0xff;
        vm.break_ptr = handlePointer(hint, vm.break_ptr);
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveUpdateStackPtr() returns (bool) {
        require(init == 10 && msg.sender == prover);
        bytes32 state1 = phases[10];
        bytes32 state2 = phases[11];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*9))&0xff;
        vm.stack_ptr = handlePointer(hint, vm.stack_ptr);
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveUpdateCallPtr() returns (bool) {
        require(init == 11 && msg.sender == prover);
        bytes32 state1 = phases[11];
        bytes32 state2 = phases[12];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*8))&0xff;
        vm.call_ptr = handlePointer(hint, vm.call_ptr);
        m.vm = hashVM();
        require(state2 == hashMachine());
        winner = prover;
        return true;
    }
    function proveUpdateMemsize() returns (bool) {
        require(init == 12 && msg.sender == prover);
        bytes32 state1 = phases[12];
        bytes32 state2 = phases[13];
        require(m.vm == hashVM());
        require(state1 == hashMachine());
        uint hint = (uint(m.op)/2**(8*12))&0xff;
        if (hint == 1) vm.memsize = vm.memsize+m.reg1;
        m.vm = hashVM();
        require(state2 == hashVM());
        winner = prover;
        return true;
    }
    
    function provePhase(bytes32[] proof, uint loc, bytes32 op) {
        if (init == 0) proveFetch(proof);
        if (init == 1) proveInit(op);
        if (init == 2) proveRead1(proof, loc);
        if (init == 3) proveRead2(proof, loc);
        if (init == 4) proveRead3(proof, loc);
        if (init == 5) proveALU();
        if (init == 6) proveWrite1(proof, loc);
        if (init == 7) proveWrite2(proof, loc);
        if (init == 8) proveUpdatePC();
        if (init == 9) proveUpdateBreakPtr();
        if (init == 10) proveUpdateStackPtr();
        if (init == 11) proveUpdateCallPtr();
        if (init == 12) proveUpdateMemsize();
    }
    
    // a and b are integer values that represent 8 bytes each
    function toMemory(uint a, uint b) returns (uint8[]) {
        uint8[] memory arr = new uint8[](16);
        storeN(arr, 0, 8, a);
        storeN(arr, 8, 8, b);
        return arr;
    }
    function storeN(uint8[] mem, uint addr, uint n, uint v) {
        for (uint i = 0; i < n; i++) {
            mem[addr+i] = uint8(v);
            v = v/256;
        }
    }
    function loadN(uint8[] mem, uint addr, uint n) returns (uint) {
        uint res = 0;
        uint exp = 1;
        for (uint i = 0; i < n; i++) {
            res += mem[addr+i]*exp;
            exp = exp*256;
        }
        return res;
    }
    function fromMemory(uint8[] mem) returns (uint a, uint b) {
        a = loadN(mem, 0, 8);
        b = loadN(mem, 8, 8);
    }
    
    function typeSize(uint ty) internal returns (uint) {
        if (ty == 0) return 4; // I32
        else if (ty == 1) return 8; // I64
        else if (ty == 2) return 4; // F32
        else if (ty == 3) return 8; // F64
    }
    
    function store(uint8[] mem, uint addr, uint v, uint ty, uint packing) {
        if (packing == 0) storeN(mem, addr, typeSize(ty), v);
        else {
            // Only integers can be packed, also cannot pack I32 to 32-bit?
            require(ty < 2 && !(ty == 0 && packing == 4));
            storeN(mem, addr, packing, v);
        }
    }
    
    function storeX(uint8[] mem, uint addr, uint v, uint hint) {
        store(mem, addr, v, (hint/2**3)&0x3, hint&0x7);
    }
    
    function load(uint8[] mem, uint addr, uint ty, uint packing, bool sign_extend) returns (uint) {
        if (packing == 0) return loadN(mem, addr, typeSize(ty));
        else {
            require(ty < 2 && !(ty == 0 && packing == 4));
            uint res = loadN(mem, addr, packing);
            if (sign_extend) {
                res = res | uint(-1)*2**(8*packing)*(res/2**(8*packing-1));
            }
            if (ty == 0) res = res % (2**32);
            else res = res % (2**64);
            debug = res;
            return res;
        }
    }
    
    function loadX(uint8[] mem, uint addr, uint hint) returns (uint) {
        return load(mem, addr, (hint/2**4)&0x3, (hint/2)&0x7, hint&0x1 == 1);
    }
    
    function test(uint a, uint b) returns (uint, uint) {
        return fromMemory(toMemory(a,b));
    }

}
