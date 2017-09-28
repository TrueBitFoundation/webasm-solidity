pragma solidity ^0.4.15;

import "./common-offchain.sol";

contract Interpreter is CommonOffchain {
    function run(bytes32[] code, bytes32[] stack, bytes32[] mem, bytes32[] globals, bytes32[] calltable,
                 bytes32[] calltypes, bytes32[] call_stack, bytes32[] input,
                 uint pc, uint stack_ptr, uint call_ptr, uint memsize) public returns (int64) {
        vm_r.code = code;
        vm_r.stack = stack;
        vm_r.mem = mem;
        vm_r.globals = globals;
        vm_r.calltable = calltable;
        vm_r.calltypes = calltypes;
        vm_r.call_stack = call_stack;
        vm_r.input_size = input;
        vm.pc = pc;
        vm.stack_ptr = stack_ptr;
        vm.call_ptr = call_ptr;
        vm.memsize = memsize;
        
        /*
        while (vm_r.code[vm.pc] != 0x0000000000000000000000000000000000000000040006060001000106000000) {
            performPhase();
        } */
        return int64(vm_r.stack[0]);
    }
    function run2(uint limit, bytes32[] code,
                  uint[] roots,
                 uint pc, uint stack_ptr, uint call_ptr, uint memsize) public returns (int64, uint, bytes32) {
        vm_r.code = code;
        vm_r.stack.length = roots[0];
        vm_r.mem.length = roots[1];
        vm_r.globals.length = roots[2];
        vm_r.calltable.length = roots[3];
        vm_r.calltypes.length = roots[4];
        vm_r.call_stack.length = roots[5];
        vm_r.input_size.length = roots[6];
        vm.pc = pc;
        vm.stack_ptr = stack_ptr;
        vm.call_ptr = call_ptr;
        vm.memsize = memsize;
        
        while (limit > 0 && vm_r.code[vm.pc] != 0x0000000000000000000000000000000000000000040006060001000106000000) {
            performPhase();
            limit--;
        }
        return (int64(vm_r.stack[0]), vm.pc, keccak256(vm_r.stack));
    }
}

