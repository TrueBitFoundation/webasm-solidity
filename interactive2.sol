pragma solidity ^0.4.16;

interface Instruction {
    function setMachine(bytes32 vm, bytes32 op, uint reg1, uint reg2, uint reg3, uint ireg);
    function setVM2(bytes32[8] roots, uint[5] pointers);
    function setup(bytes32[14] arr, address c, address p, uint i);
    function provePhase(bytes32[] proof, uint loc, bytes32 op);
}

contract Interactive2 {

    struct VM {
        /*
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
        */
        bytes32[8] roots;
        uint[5] pointers;
    }
    
    Instruction judge;
    
    struct Machine {
        bytes32 vm;
        bytes32 op;
        uint reg1;
        uint reg2;
        uint reg3;
        uint ireg;
    }

    struct Record {
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
        
        uint256 phase;
        
        bytes32[] proof;
        bytes32[14] result;
        
        // Information for the judging step
        uint loc;
        bytes32[] merkle;
        VM vm;
        Machine reg_machine;
        bytes32 op;
    }
    
    function Interactive2(address addr) {
        judge = Instruction(addr);
    }

    // perhaps they should be indexed by end state ?
    // Record[] records;
    mapping (bytes32 => Record) records;

    function testMake() returns (bytes32) {
        return make(msg.sender, msg.sender, bytes32(123), bytes32(123),
                    10, 1, 10);
    }

    event StartChallenge(address p, address c, bytes32 s, bytes32 e, uint256 idx1, uint256 idx2,
        uint256 par, uint to, bytes32 uniq);

    function make(address p, address c, bytes32 s, bytes32 e, uint256 _steps,
        uint256 par, uint to) returns (bytes32) {
        bytes32 uniq = sha3(p, c, s, e, _steps, par, to);
        Record storage r = records[uniq];
        r.prover = p;
        r.challenger = c;
        r.start_state = s;
        r.end_state = e;
        r.steps = _steps;
        r.size = par;
        if (r.size > r.steps - 2) r.size = r.steps-2;
        r.timeout = to;
        r.clock = block.number;
        r.next = r.prover;
        r.idx1 = 0;
        r.idx2 = r.steps-1;
        r.proof.length = r.steps;
        r.phase = 16;
        StartChallenge(p, c, s, e, r.idx1, r.idx2, r.size, to, uniq);
        return uniq;
    }

    function gameOver(bytes32 id) {
        Record storage r = records[id];
        require(block.number >= r.clock + r.timeout);
        if (r.next == r.prover) r.winner = r.challenger;
        else r.winner = r.prover;
    }
    
    function getIter(bytes32 id) returns (uint it, uint i1, uint i2) {
        Record storage r = records[id];
        it = (r.idx2-r.idx1)/(r.size+1);
        i1 = r.idx1;
        i2 = r.idx2;
    }
    
    event Reported(bytes32 id, uint idx1, uint ixd2, bytes32[] arr);

    function report(bytes32 id, uint i1, uint i2, bytes32[] arr) {
        Record storage r = records[id];
        require(r.size != 0 && arr.length == r.size && i1 == r.idx1 && i2 == r.idx2 &&
                msg.sender == r.prover && r.prover == r.next);
        r.clock = block.number;
        uint iter = (r.idx2-r.idx1)/(r.size+1);
        for (uint i = 0; i < arr.length; i++) {
            r.proof[r.idx1+iter*(i+1)] = arr[i];
        }
        r.next = r.challenger;
        Reported(id, i1, i2, arr);
    }
    
    function roundsTest(uint rounds, uint stuff) returns (uint it, uint i1, uint i2) {
        bytes32 id = testMake();
        Record storage r = records[id];
        for (uint i = 0; i < rounds; i++) {
            bytes32[] memory arr = new bytes32[](1);
            arr[0] = bytes32(0xffff);
            report(id, r.idx1, r.idx2, arr);
            query(id, r.idx1, r.idx2, stuff % 2);
            stuff = stuff/2;
        }
        return getIter(id);
    }

    event Queried(bytes32 id, uint idx1, uint ixd2);

    function query(bytes32 id, uint i1, uint i2, uint num) {
        Record storage r = records[id];
        require(r.size != 0 && num <= r.size && i1 == r.idx1 && i2 == r.idx2 &&
                msg.sender == r.challenger && r.challenger == r.next);
        r.clock = block.number;
        uint iter = (r.idx2-r.idx1)/(r.size+1);
        r.idx1 = r.idx1+iter*num;
        // If last segment was selected, do not change last index
        if (num != r.size) r.idx2 = r.idx1+iter;
        if (r.size > r.idx2-r.idx1-1) r.size = r.idx2-r.idx1-1;
        // size eventually becomes zero here
        r.next = r.prover;
        Queried(id, i1, i2);
    }

    function getStep(bytes32 id, uint idx) returns (bytes32) {
        Record storage r = records[id];
        return r.proof[idx];
    }
    
    event PostedPhases(bytes32 id, uint i1, bytes32[14] arr);

    function postPhases(bytes32 id, uint i1, bytes32[14] arr) {
        Record storage r = records[id];
        require(r.size == 0 && msg.sender == r.prover && r.next == r.prover && r.idx1 == i1 &&
                r.proof[r.idx1] == arr[0] && r.proof[r.idx1+1] == arr[13]);
        r.result = arr;
        r.next = r.challenger;
        PostedPhases(id, i1, arr);
    }

    function getResult(bytes32 id) returns (bytes32[14]) {
        Record storage r = records[id];
        return r.result;
    }
    
    event SelectedPhase(bytes32 id, uint i1, uint phase);
    
    function selectPhase(bytes32 id, uint i1, bytes32 st, uint q) {
        Record storage r = records[id];
        require(r.phase == 16 && msg.sender == r.challenger && r.idx1 == i1 && r.result[q] == st &&
                r.next == r.challenger);
        r.phase = q;
        SelectedPhase(id, i1, q);
        r.next = r.prover;
    }
    
    function prepareVM(bytes32 id, bytes32[8] roots, uint[5] pointers) {
        Record storage r = records[id];
        require(msg.sender == r.prover && r.next == r.prover);
        VM storage vm = records[id].vm;
        vm.roots = roots;
        vm.pointers = pointers;
    }

    function prepareMachine(bytes32 id,
        bytes32 vm,
        bytes32 op,
        uint reg1,
        uint reg2,
        uint reg3,
        uint ireg) {
        Record storage r = records[id];
        require(msg.sender == r.prover && r.next == r.prover);
        Machine storage m = records[id].reg_machine;
        m.vm = vm;
        m.op = op;
        m.reg1 = reg1;
        m.reg2 = reg2;
        m.reg3 = reg3;
        m.ireg = ireg;
    }
    
    function prepareMerkle(bytes32 id, bytes32[] proof, uint loc, bytes32 op) {
        Record storage r = records[id];
        require(msg.sender == r.prover && r.next == r.prover);
        r.loc = loc;
        r.merkle = proof;
        r.op = op;
    }
    
    function callJudge(bytes32 id, uint i1, uint q) {
        Record storage r = records[id];
        require(r.phase == q && msg.sender == r.prover && r.idx1 == i1 &&
                r.next == r.prover);
        judge.setup(r.result, r.challenger, r.prover, r.phase);
        Machine storage m = r.reg_machine;
        judge.setMachine(m.vm, m.op, m.reg1, m.reg2, m.reg3, m.ireg);
        VM storage vm = r.vm;
        judge.setVM2(vm.roots, vm.pointers);
        judge.provePhase(r.proof, r.loc, r.op);
    }

    function callJudge2(bytes32 id, uint i1, uint q,
                        bytes32[] proof, uint loc, bytes32 fetched_op,
                        bytes32 vm, bytes32 op, uint[4] regs,
                        bytes32[8] roots, uint[5] pointers) {
        Record storage r = records[id];
        require(r.phase == q && msg.sender == r.prover && r.idx1 == i1 &&
                r.next == r.prover);
        judge.setup(r.result, r.challenger, r.prover, r.phase);
        judge.setMachine(vm, op, regs[0], regs[1], regs[2], regs[3]);
        judge.setVM2(roots, pointers);
        judge.provePhase(proof, loc, fetched_op);
    }

}

