pragma solidity ^0.4.16;

import "./fs.sol";
import "./tasks.sol";

contract Ipfs is FSUtils {
    
    uint nonce;
    Tasks truebit;
    Filesystem filesystem;

    string code;
    bytes32 init;

    mapping (string => bytes32) string_to_file; 

    constructor(address tb, address fs, string code_address, bytes32 init_hash) public {
        truebit = Tasks(tb);
        filesystem = Filesystem(fs);
        code = code_address;     // address for wasm file in IPFS
        init = init_hash;        // the canonical hash
    }
    
    struct Task {
        bytes32 root;
        uint start_block;
        uint end_block;
    }
    
    mapping (uint => Task) task_info;
    mapping (bytes32 => uint) root_to_task;

    // the block should be a file that is available onchain
    function submitBlock(bytes32 file_id) public {
        uint num = nonce;
        nonce++;
        bytes32 bundle = filesystem.makeBundle(num);
        filesystem.addToBundle(bundle, file_id);
        bytes32[] memory empty = new bytes32[](0);
        filesystem.addToBundle(bundle, filesystem.createFileWithContents("output.data", num+1000000000, empty, 0));
        filesystem.finalizeBundleIPFS(bundle, code, init);
      
        uint task = truebit.addWithParameters(filesystem.getInitHash(bundle), Tasks.CodeType.WASM, Tasks.Storage.BLOCKCHAIN, idToString(bundle), 20, 20, 8, 20, 10);
        truebit.requireFile(task, hashName("output.data"), Tasks.Storage.BLOCKCHAIN);
        truebit.commit(task);
        bytes32 root = filesystem.getRoot(file_id);
        task_info[task].root = root;
        task_info[task].start_block = block.number;
        root_to_task[root] = task;
    }
    
    function solved(uint id, bytes32[] files) public {
        require(msg.sender == address(truebit));
        Task storage t = task_info[id];
        string memory ihash = string(filesystem.getByteData(files[0]));
        string_to_file[ihash] = t.root;
        t.end_block = block.number;
    }

    // resolves ipfshash to truebit file
    function load(string ipfshash) public view returns (bytes32 hash, uint sz) {
        hash = filesystem.getRoot(string_to_file[ipfshash]);
        sz = filesystem.getByteSize(string_to_file[ipfshash]);
    }
    
    // check if is still processing the file
    function clock(bytes32 root) public view returns (uint) {
        Task storage t = task_info[root_to_task[root]];
        if (t.end_block > 0) return t.end_block;
        else if (t.start_block > 0) return block.number;
        else return 0;
    }
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
       bool resolved;
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
    function clock(bytes32 id) public view returns (uint) {
        Task storage t = tasks[id];
        if (t.ipfs_block != 0) return ipfs.clock(t.ipfs_block);
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
        bytes32 block_hash;
        uint block_size;
        (block_hash, block_size) = ipfs.load(t.ipfs_hash);
        require (block_hash == t.ipfs_block && block_size == t.ipfs_size);
        t.resolved = true;
    }
    
    function resolveBlock(bytes32 id, bytes32 block_hash, uint block_size) public {
        Task storage t = tasks[id];
        t.ipfs_block = block_hash;
        t.ipfs_size = block_size;
    }
    /*
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
    }*/

    // Check if has resolved into correct state: merkle root of output data and output size
    function resolved(bytes32 id, bytes32 state, uint size) public view returns (bool) {
        Task storage t = tasks[id];
        return t.ipfs_block == state && t.ipfs_size == size && t.resolved;
    }

    function fileMerkle(bytes32[] arr, uint idx, uint level) internal returns (bytes32) {
        if (level == 0) return idx < arr.length ? keccak256(bytes16(arr[idx]), uint128(arr[idx])) : keccak256(bytes16(0), bytes16(0));
        else return keccak256(fileMerkle(arr, idx, level-1), fileMerkle(arr, idx+(2**(level-1)), level-1));
    }

}


