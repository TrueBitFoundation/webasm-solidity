pragma solidity ^0.4.15;

contract Onchain {

   uint debug;

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
    
    struct Machine {
        bytes32 vm;
        bytes32 op;
        uint reg1;
        uint reg2;
        uint reg3;
        uint ireg;
    }
    
    VM vm;
    Roots vm_r;
    Machine m;
    bytes32[] proof;
    
    bytes32 state;
    
    function setVM2(bytes32[8] roots, uint[4] pointers) internal {
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
    
    function getLeaf(uint loc) internal view returns (uint) {
        require(proof.length >= 2);
        if (loc%2 == 0) return uint(proof[0]);
        else return uint(proof[1]);
    }
    
    function setLeaf(uint loc, uint v) internal {
        require(proof.length >= 2);
        if (loc%2 == 0) proof[0] = bytes32(v);
        else proof[1] = bytes32(v);
    }

    function getRoot(uint loc) internal view returns (bytes32) {
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

    function getCode(uint loc) internal view returns (bytes32) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.code);
        return bytes32(getLeaf(loc));
    }

    function getStack(uint loc) internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.stack);
        return getLeaf(loc);
    }

    function getCallStack(uint loc) internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.call_stack);
        return getLeaf(loc);
    }
    
    function getCallTable(uint loc) internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.calltable);
        return getLeaf(loc);
    }

    function getCallTypes(uint loc) internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.calltypes);
        return getLeaf(loc);
    }

    function getMemory(uint loc) internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.mem);
        return getLeaf(loc);
    }

    function getGlobal(uint loc) internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.globals);
        return getLeaf(loc);
    }

    function getInput(uint loc) internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.input);
        return getLeaf(loc);
    }
    
    function setCallStack(uint loc, uint v) internal  {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.call_stack);
        setLeaf(loc, v);
        vm_r.call_stack = getRoot(loc);
        m.vm = hashVM();
        state = hashMachine();
    }

    function setMemory(uint loc, uint v) internal  {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.mem);
        setLeaf(loc, v);
        vm_r.mem = getRoot(loc);
        m.vm = hashVM();
        state = hashMachine();
    }

    function setStack(uint loc, uint v) internal {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.stack);
        setLeaf(loc, v);
        vm_r.stack = getRoot(loc);
        m.vm = hashVM();
        state = hashMachine();
    }

    function setGlobal(uint loc, uint v) internal {
        require(hashMachine() == state && hashVM() == m.vm);
        require(getRoot(loc) == vm_r.globals);
        setLeaf(loc, v);
        vm_r.globals = getRoot(loc);
        m.vm = hashVM();
        state = hashMachine();
    }

    function getPC() internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        return vm.pc;
    }
    
    function getMemsize() internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        return vm.memsize;
    }
    
    function getStackPtr() internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        return vm.stack_ptr;
    }
    
    function getCallPtr() internal view returns (uint) {
        require(hashMachine() == state && hashVM() == m.vm);
        return vm.call_ptr;
    }
    
    function getReg1() internal view returns (uint) {
        require(hashMachine() == state);
        return m.reg1;
    }
    
    function getReg2() internal view returns (uint) {
        require(hashMachine() == state);
        return m.reg2;
    }
    
    function getReg3() internal view returns (uint) {
        require(hashMachine() == state);
        return m.reg3;
    }

    function getIreg() internal view returns (uint) {
        require(hashMachine() == state);
        return m.ireg;
    }
    
    function getOp() internal view returns (bytes32) {
        require(hashMachine() == state);
        return m.op;
    }
    
    function setMemsize(uint v) internal {
        vm.memsize = v;
        m.vm = hashVM();
        state = hashMachine();
    }
    
    function setIreg(uint v) internal  {
        m.ireg = v;
        state = hashMachine();
    }
    
    function setReg1(uint v) internal  {
        m.reg1 = v;
        debug = v;
        state = hashMachine();
    }
    
    function setReg2(uint v) internal  {
        m.reg2 = v;
        state = hashMachine();
    }
    
    function setReg3(uint v) internal  {
        m.reg3 = v;
        state = hashMachine();
    }
    
    function setPC(uint v) internal {
        vm.pc = v;
        m.vm = hashVM();
        state = hashMachine();
    }

    function setStackPtr(uint v) internal {
        vm.stack_ptr = v;
        m.vm = hashVM();
        state = hashMachine();
    }

    function setCallPtr(uint v) internal {
        vm.call_ptr = v;
        m.vm = hashVM();
        state = hashMachine();
    }

    function setOp(bytes32 op) internal {
        m.op = op;
        m.vm = hashVM();
        state = hashMachine();
    }
    


}
