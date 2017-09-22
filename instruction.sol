pragma solidity ^0.4.15;

contract Instruction {

    bytes32[14] phases;
    address challenger;
    address prover;
    uint init;
    address winner;

    function setup(bytes32[14] arr, address c, address p, uint i) internal {
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
        bytes32 break_stack1;
        bytes32 break_stack2;
        bytes32 globals;
        bytes32 calltable;
        bytes32 calltypes;
        bytes32 call_stack;
        bytes32 input;
    }

    struct VM {
        uint pc;
        uint stack_ptr;
        uint break_ptr;
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
    
    function setVM2(bytes32[10] roots, uint[5] pointers) internal {
        require(msg.sender == prover);
        vm_r.code = roots[0];
        vm_r.stack = roots[1];
        vm_r.mem = roots[2];
        vm_r.call_stack = roots[3];
        vm_r.break_stack1 = roots[4];
        vm_r.break_stack2 = roots[5];
        vm_r.globals = roots[6];
        vm_r.calltable = roots[7];
        vm_r.calltypes = roots[8];
        vm_r.input = roots[9];

        vm.pc = pointers[0];
        vm.stack_ptr = pointers[1];
        vm.break_ptr = pointers[2];
        vm.call_ptr = pointers[3];
        vm.memsize = pointers[4];
    }
    
    function hashVM() internal view returns (bytes32) {
        bytes32[] memory arr = new bytes32[](15);
        arr[0] = vm_r.code;
        arr[1] = vm_r.mem;
        arr[2] = vm_r.stack;
        arr[3] = vm_r.globals;
        arr[4] = vm_r.call_stack;
        arr[5] = vm_r.break_stack1;
        arr[6] = vm_r.break_stack2;
        arr[7] = vm_r.calltable;
        arr[8] = vm_r.calltypes;
        arr[9] = vm_r.input;
        arr[10] = bytes32(vm.pc);
        arr[11] = bytes32(vm.stack_ptr);
        arr[12] = bytes32(vm.call_ptr);
        arr[13] = bytes32(vm.break_ptr);
        arr[14] = bytes32(vm.memsize);
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
        else if (hint == 10) return vm.break_ptr-1;
        else if (hint == 11) return vm.break_ptr-1;
        else if (hint == 12) return vm.break_ptr-1-m.reg1;
        else if (hint == 13) return vm.break_ptr-1-m.reg1;
        else if (hint == 14) return vm.call_ptr-1;
        else if (hint == 15) return (m.reg1+m.ireg)/8;
        else if (hint == 16) return m.reg1;
        else if (hint == 17) return (m.reg1+m.ireg)/8 + 1;
        else if (hint == 18) return m.reg1;
        else if (hint == 19) return m.reg1;
    }

    function writePosition(uint hint) internal view returns (uint) {
        assert(hint > 0);
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

    function readRoot(uint hint) internal view returns (bytes32) {
        assert(hint > 4);
        if (hint == 5) return vm_r.globals;
        else if (hint == 6) return vm_r.stack;
        else if (hint == 7) return vm_r.stack;
        else if (hint == 8) return vm_r.stack;
        else if (hint == 9) return vm_r.stack;
        else if (hint == 10) return vm_r.break_stack1;
        else if (hint == 11) return vm_r.break_stack2;
        else if (hint == 12) return vm_r.break_stack1;
        else if (hint == 13) return vm_r.break_stack2;
        else if (hint == 14) return vm_r.call_stack;
        else if (hint == 15) return vm_r.mem;
        else if (hint == 16) return vm_r.calltable;
        else if (hint == 17) return vm_r.mem;
        else if (hint == 18) return vm_r.calltypes;
        else if (hint == 19) return vm_r.input;
    }
    
    function writeRoot(uint hint) internal view returns (bytes32) {
        assert(hint > 0);
        if (hint == 1) return vm_r.break_stack2;
        else if (hint == 2) return vm_r.stack;
        else if (hint == 3) return vm_r.stack;
        else if (hint == 4) return vm_r.stack;
        else if (hint == 5) return vm_r.mem;
        else if (hint == 6) return vm_r.call_stack;
        else if (hint == 7) return vm_r.break_stack1;
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
    function handleALU(uint hint, uint r1, uint r2, uint r3, uint ireg) internal pure returns (uint) {
        uint res;
        if (hint == 0) return r1;
        else if (hint == 1 || hint == 6) revert(); // Trap
        // Loading from memory
        else if (hint & 0xc0 == 0xc0) {
            uint8[] memory arr = toMemory(r2, r3);
            res = loadX(arr, (r1+ireg)%8, hint);
        }
        else if (hint == 2) {
            if (r1 < r2) res = r1;
            else res = r2;
        }
        // Calculate conditional jump
        else if (hint == 3) {
            if (r1 == 0) res = r2;
            else res = r3;
        }
        // Calculate jump to jump table
        else if (hint == 4) {
            res = r2 + (r1 >= ireg ? ireg : r1);
        }
        // Handle inserting break
        else if (hint == 5) {
            res = r1 + r2 - 1;
        }
        // Check dynamic call
        else if (hint == 7) {
            if (ireg != r2) revert();
            res = 0;
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
            res = clz32(uint32(r1));
        }
        else if (hint == 0x68) {
            res = ctz32(uint32(r1));
        }
        else if (hint == 0x69) {
            res = popcnt32(uint32(r1));
        }
        else if (hint == 0x79) {
            res = clz64(uint64(r1));
        }
        else if (hint == 0x7a) {
            res = ctz64(uint64(r1));
        }
        else if (hint == 0x7b) {
            res = popcnt64(uint64(r1));
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
        // rol, ror -- fix
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
    
  function popcnt32(uint32 r1) internal pure returns (uint8) {
    uint32 temp = r1;
    temp = (temp & 0x55555555) + ((temp >> 1) & 0x55555555);
    temp = (temp & 0x33333333) + ((temp >> 2) & 0x33333333);
    temp = (temp & 0x0f0f0f0f) + ((temp >> 4) & 0x0f0f0f0f);
    temp = (temp & 0x00ff00ff) + ((temp >> 8) & 0x00ff00ff);
    temp = (temp & 0x0000ffff) + ((temp >> 16) & 0x0000ffff);
    return uint8(temp);
  }

  function popcnt64(uint64 r1) internal pure returns (uint8) {
    uint64 temp = r1;
    temp = (temp & 0x5555555555555555) + ((temp >> 1) & 0x5555555555555555);
    temp = (temp & 0x3333333333333333) + ((temp >> 2) & 0x3333333333333333);
    temp = (temp & 0x0f0f0f0f0f0f0f0f) + ((temp >> 4) & 0x0f0f0f0f0f0f0f0f);
    temp = (temp & 0x00ff00ff00ff00ff) + ((temp >> 8) & 0x00ff00ff00ff00ff);
    temp = (temp & 0x0000ffff0000ffff) + ((temp >> 16) & 0x0000ffff0000ffff);
    temp = (temp & 0x00000000ffffffff) + ((temp >> 32) & 0x00000000ffffffff);
    return uint8(temp);
  }

  function clz32(uint32 r1) internal pure returns (uint8) {
    if (r1 == 0) return 32;
    uint32 temp_r1 = r1;
    uint8 n = 0;
    if (temp_r1 & 0xffff0000 == 0) {
      n += 16;
      temp_r1 = temp_r1 << 16;
    }
    if (temp_r1 & 0xff000000 == 0) {
      n += 8;
      temp_r1 = temp_r1 << 8;
    }
    if (temp_r1 & 0xf0000000 == 0) {
      n += 4;
      temp_r1 = temp_r1 << 4;
    }
    if (temp_r1 & 0xc0000000 == 0) {
      n += 2;
      temp_r1 = temp_r1 << 2;
    }
    if (temp_r1 & 0x8000000 == 0) {
      n++;
    }
    return n;
  }

  function clz64(uint64 r1) internal pure returns (uint8) {
    if (r1 == 0) return 64;
    uint64 temp_r1 = r1;
    uint8 n = 0;
    if (temp_r1 & 0xffffffff00000000 == 0) {
      n += 32;
      temp_r1 = temp_r1 << 32;
    }
    if (temp_r1 & 0xffff000000000000 == 0) {
      n += 16;
      temp_r1 == temp_r1 << 16;
    }
    if (temp_r1 & 0xff00000000000000 == 0) {
      n+= 8;
      temp_r1 = temp_r1 << 8;
    }
    if (temp_r1 & 0xf000000000000000 == 0) {
      n += 4;
      temp_r1 = temp_r1 << 4;
    }
    if (temp_r1 & 0xc000000000000000 == 0) {
      n += 2;
      temp_r1 = temp_r1 << 2;
    }
    if (temp_r1 & 0x8000000000000000 == 0) {
      n += 1;
    }
    return n;
  }

  function ctz32(uint32 r1) internal pure returns (uint8) {
    if (r1 == 0) return 32;
    uint32 temp_r1 = r1;
    uint8 n = 0;
    if (temp_r1 & 0x0000ffff == 0) {
      n += 16;
      temp_r1 = temp_r1 >> 16;
    }
    if (temp_r1 & 0x000000ff == 0) {
      n += 8;
      temp_r1 = temp_r1 >> 8;
    }
    if (temp_r1 & 0x0000000f == 0) {
      n += 4;
      temp_r1 = temp_r1 >> 4;
    }
    if (temp_r1 & 0x00000003 == 0) {
      n += 2;
      temp_r1 = temp_r1 >> 2;
    }
    if (temp_r1 & 0x00000001 == 0) {
      n += 1;
    }
    return n;
  }

  function ctz64(uint64 r1) internal pure returns (uint8) {
    if (r1 == 0) return 64;
    uint64 temp_r1 = r1;
    uint8 n = 0;
    if (temp_r1 & 0x00000000ffffffff == 0) {
      n += 32;
      temp_r1 = temp_r1 >> 32;
    }
    if (temp_r1 & 0x000000000000ffff == 0) {
      n += 16;
      temp_r1 = temp_r1 >> 16;
    }
    if (temp_r1 & 0x00000000000000ff == 0) {
      n += 8;
      temp_r1 = temp_r1 >> 8;
    }
    if (temp_r1 & 0x000000000000000f == 0) {
      n += 4;
      temp_r1 = temp_r1 >> 4;
    }
    if (temp_r1 & 0x0000000000000003 == 0) {
      n += 2;
      temp_r1 = temp_r1 >> 2;
    }
    if (temp_r1 & 0x0000000000000001 == 0) {
      n += 1;
    }
    return n;
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
        
        if (hint == 1) vm_r.break_stack2 = root;
        else if (hint == 2) vm_r.stack = root;
        else if (hint == 3) vm_r.stack = root;
        else if (hint == 4) vm_r.stack = root;
        else if (hint == 5) vm_r.mem = root;
        else if (hint == 6) vm_r.call_stack = root;
        else if (hint == 7) vm_r.break_stack1 = root;
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
    function proveUpdateBreakPtr() internal returns (bool) {
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
    function proveUpdateStackPtr() internal returns (bool) {
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
    function proveUpdateCallPtr() internal returns (bool) {
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
    function proveUpdateMemsize() internal returns (bool) {
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
        if (init == 9) proveUpdateBreakPtr();
        if (init == 10) proveUpdateStackPtr();
        if (init == 11) proveUpdateCallPtr();
        if (init == 12) proveUpdateMemsize();
    }
    
    // a and b are integer values that represent 8 bytes each
    function toMemory(uint a, uint b) internal pure returns (uint8[]) {
        uint8[] memory arr = new uint8[](16);
        storeN(arr, 0, 8, a);
        storeN(arr, 8, 8, b);
        return arr;
    }
    function storeN(uint8[] mem, uint addr, uint n, uint v) internal pure {
        for (uint i = 0; i < n; i++) {
            mem[addr+i] = uint8(v);
            v = v/256;
        }
    }
    function loadN(uint8[] mem, uint addr, uint n) internal pure returns (uint) {
        uint res = 0;
        uint exp = 1;
        for (uint i = 0; i < n; i++) {
            res += mem[addr+i]*exp;
            exp = exp*256;
        }
        return res;
    }
    function fromMemory(uint8[] mem) internal pure returns (uint a, uint b) {
        a = loadN(mem, 0, 8);
        b = loadN(mem, 8, 8);
    }
    
    function typeSize(uint ty) internal pure returns (uint) {
        if (ty == 0) return 4; // I32
        else if (ty == 1) return 8; // I64
        else if (ty == 2) return 4; // F32
        else if (ty == 3) return 8; // F64
    }
    
    function store(uint8[] mem, uint addr, uint v, uint ty, uint packing) internal pure {
        if (packing == 0) storeN(mem, addr, typeSize(ty), v);
        else {
            // Only integers can be packed, also cannot pack I32 to 32-bit?
            require(ty < 2 && !(ty == 0 && packing == 4));
            storeN(mem, addr, packing, v);
        }
    }
    
    function storeX(uint8[] mem, uint addr, uint v, uint hint) internal pure {
        store(mem, addr, v, (hint/2**3)&0x3, hint&0x7);
    }
    
    function load(uint8[] mem, uint addr, uint ty, uint packing, bool sign_extend) internal pure returns (uint) {
        if (packing == 0) return loadN(mem, addr, typeSize(ty));
        else {
            require(ty < 2 && !(ty == 0 && packing == 4));
            uint res = loadN(mem, addr, packing);
            if (sign_extend) {
                res = res | uint(-1)*2**(8*packing)*(res/2**(8*packing-1));
            }
            if (ty == 0) res = res % (2**32);
            else res = res % (2**64);
            return res;
        }
    }
    
    function loadX(uint8[] mem, uint addr, uint hint) internal pure returns (uint) {
        return load(mem, addr, (hint/2**4)&0x3, (hint/2)&0x7, hint&0x1 == 1);
    }
    
    /*
    function test(uint a, uint b) returns (uint, uint) {
        return fromMemory(toMemory(a,b));
    }*/
    
    function judge(bytes32[14] res, uint q,
                        bytes32[] proof, uint loc, bytes32 fetched_op,
                        bytes32 vm_, bytes32 op, uint[4] regs,
                        bytes32[10] roots, uint[5] pointers) public returns (uint) {
        setup(res,msg.sender,msg.sender,q);
        setMachine(vm_, op, regs[0], regs[1], regs[2], regs[3]);
        setVM2(roots, pointers);
        provePhase(proof, loc, fetched_op);
        return debug;
    }

}
