pragma solidity ^0.4.16;

contract Ipfs {
    // resolves ipfshash to truebit file
    function load(string ipfshash) public returns (bytes32 hash, uint sz);
    // check if is still processing the file
    function clock(string ipfshash) public returns (uint);
}

contract IpfsLoad {

    Ipfs ipfs;

    constructor(address ipfs_) public {
        ipfs = Ipfs(ipfs_);
    }
    
    uint uniq;
    
    struct Task {
       address solver;
       address verifier;
       bytes32 name_hash;
       string ipfs_hash;
       bytes32 ipfs_block;
       uint ipfs_size;
       uint clock;
    }
    
    mapping (bytes32 => Task) tasks;

    // Initializes a new custom verification game
    function init(bytes32 state, uint state_size, uint /* r3 */, address solver, address verifier) public returns (bytes32) {
        bytes32 id = keccak256(state, state_size, solver, verifier, uniq++);
        // require(state_size == );
        Task storage t = tasks[id];
        t.solver = solver;
        t.verifier = verifier;
        t.name_hash = state;
        t.clock = block.number;
    }

    // Last time the task was updated
    function clock(bytes32 id) public returns (uint) {
        Task storage t = tasks[id];
        if (bytes(t.ipfs_hash).length > 0) return ipfs.clock(t.ipfs_hash);
        return t.clock;
    }
    
    function arrange(bytes str) internal pure returns (bytes32[]) {
        bytes32[] memory res = new bytes32[]((str.length+31)/32);
        uint ptr = 0;
        for (uint i = 0; i < res.length; i++) {
            uint word = 0;
            for (uint j = 0; j < 32; j++) {
                word = 256*word; // shift byte
                if (ptr < str.length) word = word | uint(str[ptr]);
                ptr++;
            }
            res[i] = bytes32(word);
        }
        return res;
    }
    
    function resolveName(bytes32 id, string ipfs_hash, uint sz) public {
        Task storage t = tasks[id];
        bytes32 name = fileMerkle(arrange(bytes(ipfs_hash)), 0, sz);
        require(name == t.name_hash);
        t.ipfs_hash = ipfs_hash;
    }
    
    function resolveBlock(bytes32 id) public {
        Task storage t = tasks[id];
        bytes32 block_hash;
        uint block_size;
        (block_hash, block_size) = ipfs.load(t.ipfs_hash);
        t.ipfs_block = block_hash;
        t.ipfs_size = block_size;
    }

    // Check if has resolved into correct state: merkle root of output data and output size
    function resolved(bytes32 id, bytes32 state, uint size) public view returns (bool) {
        Task storage t = tasks[id];
        return t.ipfs_block == state && t.ipfs_size == size;
    }

    function fileMerkle(bytes32[] arr, uint idx, uint level) internal returns (bytes32) {
        if (level == 0) return idx < arr.length ? keccak256(bytes16(arr[idx]), uint128(arr[idx])) : keccak256(bytes16(0), bytes16(0));
        else return keccak256(fileMerkle(arr, idx, level-1), fileMerkle(arr, idx+(2**(level-1)), level-1));
    }

}


