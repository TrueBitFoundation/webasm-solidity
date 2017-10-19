
pragma solidity ^0.4.16;

interface TrueBit {
   function createFileWithContents(string name, uint nonce, bytes32[] arr, uint sz) public returns (uint);
   function addWithFile(bytes32 init, string file, uint input_file) public returns (uint);
   function getSize(uint id) public view returns (uint);
   function forwardData(uint id, address a) public;
}

contract TestUser {
   uint nonce;
   TrueBit truebit;

   string code;
   bytes32 init; // need to modify this, so that it doesn't depend on the IO block
   
   bytes32 val;
   
   event Success();
   
   function TestUser(address tb, string code_hash, bytes32 init_hash) public {
      truebit = TrueBit(tb);
      code = code_hash;
      init = init_hash;
   }

   function doStuff() public {
      bytes32[] memory arr = new bytes32[](5);
      arr[0] = bytes32(msg.sender);
      arr[1] = block.blockhash(block.number-1);
      uint file = truebit.createFileWithContents("test.data", nonce, arr, 100);
      nonce++;
      uint id = truebit.addWithFile(init, code, file); // it should then call back
   }
   
   function debugStuff() public returns (uint, uint) {
      bytes32[] memory arr = new bytes32[](5);
      arr[0] = bytes32(msg.sender);
      arr[1] = block.blockhash(block.number-1);
      uint file = truebit.createFileWithContents("test.data", nonce, arr, 100);
      nonce++;
      uint id = truebit.addWithFile(init, code, file); // it should then call back
      return (file, id);
   }
   
   function consume(uint file_id, bytes32[] arr) public {
      val = arr[2];
      Success();
   }
   
   // this is the callback name
   function solved(uint id, bytes32 result, bytes32 file) public {
      // could check the task id
      truebit.forwardData(uint(file), this);
   }

}


