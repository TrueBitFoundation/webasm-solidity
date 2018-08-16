pragma solidity ^0.4.15;

import "./common-onchain.sol";
import "./IDisputeResolver.sol";

// dispute for one computation step, divide into phases 
contract WasmDispute is CommonOnchain, IDisputeResolver {

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

    function newGame(address s, address v, bytes32 spec, uint) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(abi.encodePacked(s, v, spec));
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
        require(t.spec == keccak256(abi.encodePacked(phases[0], phases[12])));
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

    function judgeDispute(bytes32 dispute_id, bytes32[] _proof, bytes32[] _proof2, bytes32 vm_, bytes32 op, uint[4] regs, bytes32[10] roots, uint[4] pointers) public {
        
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
        uint when;
    }

    mapping (bytes32 => Task) tasks;

    function newGame(address s, address v, bytes32 spec, uint when) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(abi.encodePacked(s, v, spec));
        Task storage t = tasks[id];
        t.solver = s;
        t.verifier = v;
        t.spec = spec;
        t.bnum = block.number;
        t.when = when;
        return id;
    }

    function status(bytes32 id) public view returns (Status) {
        Task storage t = tasks[id];
        if (t.spec == 0) return Status.NONE;
        IDisputeResolver res = IDisputeResolver(t.res);
        if (t.res != 0 && res.status(t.dispute_id) == Status.SOLVER_WINS || t.phases.length > 0 && t.bnum + TIMEOUT < block.number && t.dispute_id == 0) return Status.SOLVER_WINS;
        if (t.bnum + TIMEOUT < block.number || t.res != 0 && res.status(t.dispute_id) == Status.VERIFIER_WINS) return Status.VERIFIER_WINS;
        return Status.UNRESOLVED;
    }

    function postPhases(bytes32 dispute_id, bytes32[] phases, address res) public {
        Task storage t = tasks[dispute_id];
        require(msg.sender == t.solver);
        t.phases = phases;
        t.bnum = block.number;
        t.res = res;
        require(t.spec == keccak256(abi.encodePacked(phases[0], phases[phases.length-1], phases.length, res)));
    }

    function selectPhase(bytes32 dispute_id, uint q) public {
        Task storage t = tasks[dispute_id];
        require(msg.sender == t.solver);
        require(q < t.phases.length-1);
        t.dispute_id = IDisputeResolver(t.res).newGame(t.solver, t.verifier, keccak256(abi.encodePacked(t.phases[q], t.phases[q+1], q)), t.when);
    }

}

// abstract dispute for handling a computation step
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
    
    function newGame(address s, address v, bytes32 spec, uint) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(abi.encodePacked(s, v, spec));
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
        require(t.spec == keccak256(abi.encodePacked(state, transition(state, q), q)));
        t.solved = true;
    }

}

// handling a single phase. The idea is that by composing this with PhaseDispute, we get the same results as WasmDispute
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

// implements the interactive search
contract InteractiveDispute is IDisputeResolver {

    uint constant TIMEOUT = 10;

    struct Task {
        address solver;
        address verifier;
        uint bnum;
        bool verifier_turn;
        bytes32 spec;
        uint when;
        bytes32[] proof;
        address res;
        bytes32 dispute_id;
        uint256 idx1;
        uint256 idx2;
        uint size; // size == k-1 in k-ary search
    }

    mapping (bytes32 => Task) tasks;
    
    function newGame(address s, address v, bytes32 spec, uint when) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(abi.encodePacked(s, v, spec));
        Task storage t = tasks[id];
        t.solver = s;
        t.verifier = v;
        t.spec = spec;
        t.bnum = block.number;
        t.when = when;
        return id;
    }
    
    function init(bytes32 dispute_id, address res, bytes32 first, bytes32 last, uint steps, uint size) public {
        Task storage t = tasks[dispute_id];
        require(t.spec == keccak256(abi.encodePacked(res, first, last, steps, size)));
        t.proof.length = steps;
        t.proof[0] = first;
        t.proof[t.proof.length-1] = last;
        if (t.size > steps - 2) t.size = steps-2;
        t.idx2 = steps-1;
        t.bnum = block.number;
        t.res = res;
    }
    
    function status(bytes32 id) public view returns (Status) {
        Task storage t = tasks[id];
        if (t.spec == 0) return Status.NONE;
        IDisputeResolver res = IDisputeResolver(t.res);
        if (t.res != 0 && res.status(t.dispute_id) == Status.SOLVER_WINS)  return Status.SOLVER_WINS;
        if (t.res != 0 && res.status(t.dispute_id) == Status.VERIFIER_WINS)  return Status.VERIFIER_WINS;
        if (t.bnum + TIMEOUT < block.number && t.verifier_turn) return Status.SOLVER_WINS;
        if (!t.verifier_turn && t.dispute_id == 0 && t.bnum + TIMEOUT < block.number) return Status.VERIFIER_WINS;
        return Status.UNRESOLVED;
    }
    
    event Reported(bytes32 id, uint idx1, uint idx2, bytes32[] arr);
    event Queried(bytes32 id, uint idx1, uint idx2);

    function report(bytes32 id, uint i1, uint i2, bytes32[] arr) public {
        Task storage r = tasks[id];
        require(!r.verifier_turn && msg.sender == r.solver);
        require (arr.length == r.size && i1 == r.idx1 && i2 == r.idx2);
        r.bnum = block.number;
        uint iter = (r.idx2-r.idx1)/(r.size+1);
        for (uint i = 0; i < arr.length; i++) {
            r.proof[r.idx1+iter*(i+1)] = arr[i];
        }
        r.verifier_turn = true;
        emit Reported(id, i1, i2, arr);
    }

    function query(bytes32 id, uint i1, uint i2, uint num) public {
        Task storage r = tasks[id];
        require(r.verifier_turn && msg.sender == r.verifier);
        require(num <= r.size && i1 == r.idx1 && i2 == r.idx2);
        r.bnum = block.number;
        uint iter = (r.idx2-r.idx1)/(r.size+1);
        r.idx1 = r.idx1+iter*num;
        // If last segment was selected, do not change last index
        if (num != r.size) r.idx2 = r.idx1+iter;
        if (r.size > r.idx2-r.idx1-1) r.size = r.idx2-r.idx1-1;
        r.verifier_turn = false;
        emit Queried(id, r.idx1, r.idx2);
        // Size eventually becomes zero here
        // Then call step resolver
        if (r.size == 0) r.dispute_id = IDisputeResolver(r.res).newGame(r.solver, r.verifier, keccak256(abi.encodePacked(r.proof[r.idx1], r.proof[r.idx1+1])), r.when);
    }

}

// helper class
contract BasicDispute is IDisputeResolver {

    uint constant TIMEOUT = 10;

    struct Task {
        address solver;
        address verifier;
        uint bnum;
        bytes32 spec;
        uint when;
    }

    mapping (bytes32 => Task) tasks;
    
    function newGame(address s, address v, bytes32 spec, uint when) public returns (bytes32) {
        require(spec != 0);
        bytes32 id = keccak256(s, v, spec);
        Task storage t = tasks[id];
        t.solver = s;
        t.verifier = v;
        t.spec = spec;
        t.bnum = block.number;
        t.when = when;
        return id;
    }
}

// combination of two disputes
contract AndDispute is BasicDispute {
    IDisputeResolver a;
    IDisputeResolver b;

    mapping (bytes32 => bytes32) dispute_a;
    mapping (bytes32 => bytes32) dispute_b;

    constructor (address aa, address ab) public {
        a = IDisputeResolver(aa);
        b = IDisputeResolver(ab);
    }

    function init(bytes32 id, bytes32 da, bytes32 db, uint when) public {
        Task storage t = tasks[id];
        require(t.spec == keccak256(da, db));
        dispute_a[id] = a.newGame(t.solver, t.verifier, da, when);
        dispute_b[id] = b.newGame(t.solver, t.verifier, db, when);
    }

    function status(bytes32 id) public view returns (Status) {
        Task storage t = tasks[id];
        if (t.spec == 0) return Status.NONE;
        Status sa = a.status(dispute_a[id]);
        Status sb = b.status(dispute_b[id]);
        if (sa == Status.VERIFIER_WINS) return Status.VERIFIER_WINS;
        if (sb == Status.VERIFIER_WINS) return Status.VERIFIER_WINS;
        if (sa == Status.SOLVER_WINS && sb == Status.SOLVER_WINS) return Status.SOLVER_WINS;
        return Status.UNRESOLVED;
    }

}

// Combine multiple similar disputes. Solver must be able to win every subdispute to win this
contract MultipleDispute is BasicDispute {
    IDisputeResolver a;

    struct Dispute {
        bytes32[] lst;
        bytes32[] ids;
    }

    mapping (bytes32 => Dispute) disputes;

    constructor (address aa) public {
        a = IDisputeResolver(aa);
    }

    function init(bytes32 id, bytes32[] lst) public {
        Task storage t = tasks[id];
        Dispute storage d = disputes[id];
        require(t.spec == keccak256(lst));
        d.lst = lst;
        for (uint i = 0; i < lst.length; i++) d.ids.push(a.newGame(t.solver, t.verifier, lst[i], t.when));
    }

    function status(bytes32 id) public view returns (Status) {
        Task storage t = tasks[id];
        if (t.spec == 0) return Status.NONE;
        Dispute storage d = disputes[id];
        for (uint i = 0; i < d.ids.length; i++) {
            Status sa = a.status(d.ids[i]);
            if (sa == Status.VERIFIER_WINS) return Status.VERIFIER_WINS;
            if (sa != Status.SOLVER_WINS) return Status.UNRESOLVED;
        }
        return Status.SOLVER_WINS;
    }

}

// Handling uploading files using dispute resolution layer needs time stamps

import "./fs.sol";

contract UploadManager {

    Filesystem fs;

    enum Storage {
        IPFS,
        BLOCKCHAIN
    }

    struct RequiredFile {
       bytes32 name_hash;
       Storage file_storage;
       bytes32 file_id;
    }

    struct Spec {
       RequiredFile[] reqs;
       bool locked;
       uint filled;
       address owner;
       
       bytes32 name;
       bytes32 data;
    }

    mapping (bytes32 => Spec) uploads;
    
    constructor(address f) public {
        fs = Filesystem(f);
    }
    
    function init(bytes32 id, bytes32 name, bytes32 data) public {
        Spec storage io = uploads[id];
        require(io.owner == 0);
        io.owner = msg.sender;
        io.name = name;
        io.data = data;
    }

    function requireFile(bytes32 id, bytes32 hash, Storage st) public {
        Spec storage io = uploads[id];
        require(!io.locked);
        require(io.owner == msg.sender);
        io.reqs.push(RequiredFile(hash, st, 0));
    }
    
    function enough(bytes32 id) public {
        Spec storage io = uploads[id];
        require(io.owner == 0 || io.owner == msg.sender);
        io.locked = true;
    }

    function uploadFile(bytes32 id, uint num, bytes32 file_id, bytes32[] name_proof, bytes32[] data_proof, uint file_num) public returns (bool) {
        Spec storage io = uploads[id];
        RequiredFile storage file = io.reqs[num];
        if (!checkProof(fs.getRoot(file_id), io.data, data_proof, file_num) || !checkProof(fs.getNameHash(file_id), io.name, name_proof, file_num)) return false;

        file.file_id = file_id;
        return true;
    }
    
    function checkProof(bytes32 hash, bytes32 root, bytes32[] proof, uint loc) public pure returns (bool) {
        return uint(hash) == getLeaf(proof, loc) && root == getRoot(proof, loc);
    }

    function getLeaf(bytes32[] proof, uint loc) internal pure returns (uint) {
        require(proof.length >= 2);
        if (loc%2 == 0) return uint(proof[0]);
        else return uint(proof[1]);
    }

    function getRoot(bytes32[] proof, uint loc) internal pure returns (bytes32) {
        require(proof.length >= 2);
        bytes32 res = keccak256(proof[0], proof[1]);
        for (uint i = 2; i < proof.length; i++) {
            loc = loc/2;
            if (loc%2 == 0) res = keccak256(res, proof[i]);
            else res = keccak256(proof[i], res);
        }
        require(loc < 2); // This should be runtime error, access over bounds
        return res;
    }

    function fill(bytes32 id) public {
        Spec storage io = uploads[id];
        require(io.filled == 0);
        io.filled = block.number;
        for (uint i = 0; i < io.reqs.length; i++) require(io.reqs[i].file_id != 0);
    }

    function good(bytes32 id, uint when) public view returns (bool) {
        Spec storage io = uploads[id];
        return io.filled < when;
    }

}

interface CheckTime {
    function good(bytes32 id, uint when) external view returns (bool);
}

contract TimedDispute is BasicDispute {
    CheckTime a;
    
    constructor(address aa) public {
        a = CheckTime(aa);
    }
    
    function status(bytes32 id) public view returns (Status) {
        Task storage t = tasks[id];
        if (a.good(t.spec, t.when)) return Status.SOLVER_WINS;
        else return Status.VERIFIER_WINS;
    }

}

