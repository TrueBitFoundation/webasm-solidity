
pragma solidity ^0.4.16;

interface TrueBit {
   function createFileWithContents(string name, uint nonce, bytes32[] arr, uint sz) public returns (uint);
   function getData(uint id) public view returns (bytes32[]);
   function addWithFile(bytes32 init, string file, uint input_file) public returns (uint);
}

contract TestUser {
   uint nonce;
   TrueBit truebit;

   string code;
   bytes32 init; // need to modify this, so that it doesn't depend on the IO block
   
   function TestUser(address tb, string code_hash, bytes32 init_hash) {
      truebit = TrueBit(tb);
      code = code_hash;
      init = init_hash;
   }

   function doStuff() {
      bytes32[] memory arr = new bytes32[](5);
      arr[0] = msg.sender;
      arr[1] = block.blockhash(block.number-1);
      uint file = truebit.createFileWithContents("test.data", nonce, arr, 100);
      nonce++;
      uint id = truebit.addWithFile(init, code, file); // it should then call back
   }
   
   // this is the callback name
   function solved(uint id, bytes32 result, bytes32 file) {
      // could check the task id
      bytes32 memory arr = truebit.getData(file);
   }

}


