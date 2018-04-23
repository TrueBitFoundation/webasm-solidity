pragma solidity ^0.4.15;

import "./common-onchain.sol";
import "./IDisputeResolver.sol";

contract Dispute is CommonOnchain, IDisputeResolver {

    uint constant TIMEOUT = 10;

    struct Task {
        address solver;
        address verifier;
        uint bnum;
        bytes32 spec;
        bytes32[] phases;
        uint selected_phase;
        bool passed;
    }

    mapping (bytes32 => Task) tasks;

    function newGame(address s, address v, bytes32 spec) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(s, v, spec);
        Task storage t = tasks[id];
        t.solver = s;
        t.verifier = v;
        t.spec = spec;
        t.bnum = block.number;
        return id;
    }

    function status(bytes32 dispute_id) public view returns (Status) {
        Task storage t = tasks[dispute_id];
        if (t.spec == 0) return Status.NONE;
        if (t.passed || t.phases.length == 13 && t.bnum + TIMEOUT < block.number && t.selected_phase == 0) return Status.SOLVER_WINS;
        if (t.bnum + TIMEOUT < block.number) return Status.VERIFIER_WINS;
        return Status.UNRESOLVED;
    }

    function postPhases(bytes32 dispute_id, bytes32[13] phases) public {
        Task storage t = tasks[dispute_id];
        require(msg.sender == t.solver);
        t.phases = phases;
        t.bnum = block.number;
        require(t.spec == keccak256(phases[0], phases[12]));
    }

    function selectPhase(bytes32 dispute_id, uint q) public {
        Task storage t = tasks[dispute_id];
        require(msg.sender == t.solver);
        require(q < 12); // cannot select last phase
        t.selected_phase = q+1;
    }

    bytes32 mask = 0xffffffffffffffffffffffffffffffffffffffffffffffff;

    function checkProof(bytes32[] pr, bytes32[] pr2) internal view {
       if (pr2.length == 0 && !(phase == 7 && getHint(7) == 0x0c)) require (pr.length == 0 || (pr.length != 1 && pr[0] == pr[0]&mask && pr[1] == pr[1]&mask));
    }

    function judgeDispute(bytes32 dispute_id,
                        bytes32[] _proof, bytes32[] _proof2,
                        bytes32 vm_, bytes32 op, uint[4] regs,
                        bytes32[10] roots, uint[4] pointers) public {
        
        Task storage t = tasks[dispute_id];
        require (t.selected_phase > 0);
        uint q = t.selected_phase - 1;

        setMachine(vm_, op, regs[0], regs[1], regs[2], regs[3]);
        setVM(roots, pointers);
        // Special initial state
        if (q == 0) {
            m.vm = hashVM();
            state = hashMachine();
            require(m.vm == t.phases[q]);
        }
        else {
           state = t.phases[q];
           require(state == hashMachine());
           require(hashVM() == m.vm);
        }
        phase = q;
        checkProof(_proof, _proof2);
        proof = _proof;
        proof2 = _proof2;
        performPhase();
        // Special final state
        if (q == 11) state = m.vm;
        require (state == t.phases[q+1]);
        
        t.passed = true;
    }

}

// resolve a dispute with small number of steps
contract PhaseDispute is IDisputeResolver {

    uint constant TIMEOUT = 10;

    struct Task {
        address solver;
        address verifier;
        uint bnum;
        bytes32 spec;
        bytes32[] phases;
        address res;
        bytes32 dispute_id;
    }

    mapping (bytes32 => Task) tasks;

    function newGame(address s, address v, bytes32 spec) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(s, v, spec);
        Task storage t = tasks[id];
        t.solver = s;
        t.verifier = v;
        t.spec = spec;
        t.bnum = block.number;
        return id;
    }

    function status(bytes32 dispute_id) public view returns (Status) {
        Task storage t = tasks[dispute_id];
        if (t.spec == 0) return Status.NONE;
        IDisputeResolver res = IDisputeResolver(t.res);
        if (t.res != 0 && res.status(dispute_id) == Status.SOLVER_WINS || t.phases.length > 0 && t.bnum + TIMEOUT < block.number && t.dispute_id == 0) return Status.SOLVER_WINS;
        if (t.bnum + TIMEOUT < block.number || t.res != 0 && res.status(dispute_id) == Status.VERIFIER_WINS) return Status.VERIFIER_WINS;
        return Status.UNRESOLVED;
    }

    function postPhases(bytes32 dispute_id, bytes32[] phases, address res) public {
        Task storage t = tasks[dispute_id];
        require(msg.sender == t.solver);
        t.phases = phases;
        t.bnum = block.number;
        t.res = res;
        require(t.spec == keccak256(phases[0], phases[phases.length-1], phases.length, res));
    }

    function selectPhase(bytes32 dispute_id, uint q) public {
        Task storage t = tasks[dispute_id];
        require(msg.sender == t.solver);
        require(q < t.phases.length-1);
        t.dispute_id = IDisputeResolver(t.res).newGame(t.solver, t.verifier, keccak256(t.phases[q], t.phases[q+1], q));
    }

}

contract TransitionDispute is IDisputeResolver {

    uint constant TIMEOUT = 10;

    struct Task {
        address solver;
        address verifier;
        uint bnum;
        bytes32 spec;
        bool solved;
    }

    mapping (bytes32 => Task) tasks;
    
    function newGame(address s, address v, bytes32 spec) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(s, v, spec);
        Task storage t = tasks[id];
        t.solver = s;
        t.verifier = v;
        t.spec = spec;
        t.bnum = block.number;
        return id;
    }
    
    function status(bytes32 dispute_id) public view returns (Status) {
        Task storage t = tasks[dispute_id];
        if (t.spec == 0) return Status.NONE;
        if (t.solved) return Status.SOLVER_WINS;
        if (t.bnum + TIMEOUT < block.number) return Status.VERIFIER_WINS;
        return Status.UNRESOLVED;
    }    

    function transition(bytes32 state, uint q) internal returns (bytes32);

    function judge(bytes32 dispute_id, bytes32 state, uint q) public {
        Task storage t = tasks[dispute_id];
        require(t.spec == keccak256(state, transition(state, q), q));
        t.solved = true;
    }

}

contract StepDispute is CommonOnchain, TransitionDispute {

    bytes32 mask = 0xffffffffffffffffffffffffffffffffffffffffffffffff;

    function checkProof(bytes32[] pr, bytes32[] pr2) internal view {
       if (pr2.length == 0 && !(phase == 7 && getHint(7) == 0x0c)) require (pr.length == 0 || (pr.length != 1 && pr[0] == pr[0]&mask && pr[1] == pr[1]&mask));
    }
    
    function transition(bytes32 init, uint q) internal returns (bytes32) {
        // Special initial state
        if (q == 0) {
            m.vm = hashVM();
            state = hashMachine();
            require(m.vm == init);
        }
        else {
           require(hashVM() == m.vm);
           state = init;
           require(state == hashMachine());
        }
        phase = q;
        performPhase();
        if (q == 11) return m.vm;
        else return state;
    }

    function prepare(bytes32[] _proof, bytes32[] _proof2,
                        bytes32 vm_, bytes32 op, uint[4] regs,
                        bytes32[10] roots, uint[4] pointers) internal {
        setMachine(vm_, op, regs[0], regs[1], regs[2], regs[3]);
        setVM(roots, pointers);
        checkProof(_proof, _proof2);
        proof = _proof;
        proof2 = _proof2;
    }
    
    function prepareAndJudge(
                        bytes32 dispute_id, bytes32 state, uint q,
                        bytes32[] _proof, bytes32[] _proof2,
                        bytes32 vm_, bytes32 op, uint[4] regs,
                        bytes32[10] roots, uint[4] pointers) public {
         prepare(_proof, _proof2, vm_, op, regs, roots, pointers);
         judge(dispute_id, state, q);
    }
    
}

