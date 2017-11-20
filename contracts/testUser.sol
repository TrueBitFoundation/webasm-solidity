
pragma solidity ^0.4.16;

interface TrueBit {

   function createFileWithContents(string name, uint nonce, bytes32[] arr, uint sz) public returns (bytes32);
   function getSize(uint id) public view returns (uint);
   function forwardData(uint id, address a) public;
   
   function idToString(bytes32 id) public pure returns (string);
   function getInitHash(bytes32 bid) public view returns (bytes32);
   function makeSimpleBundle(uint num, address code, bytes32 code_init, bytes32 file_id) public returns (bytes32);
   function add(bytes32 init, /* CodeType */ uint8 ct, /* Storage */ uint8 cs, string stor) public returns (uint);
   // function add(bytes32 init, uint8 ct, uint8 cs) public returns (uint);
   
}

contract TestUser {
   uint nonce;
   TrueBit truebit;

   address code;
   bytes32 init;

   bytes32 val;

   event Success();

   function TestUser(address tb, address code_address, bytes32 init_hash) public {
      truebit = TrueBit(tb);
      code = code_address;
      init = init_hash;
   }
   
      
   function idToString(bytes32 id) public pure returns (string) {
      bytes memory res = new bytes(32);
      for (uint i = 0; i < 32; i++) res[i] = bytes1((uint(id) / (2**(8*i))));
      return string(res);
   }

   function doStuff() public {
      bytes32[] memory arr = new bytes32[](5);
      arr[0] = bytes32(msg.sender) & 0xff;
      arr[1] = block.blockhash(block.number-1) & 0xff;
      bytes32 file = truebit.createFileWithContents("test.data", nonce, arr, 100);
      nonce++;
      bytes32 bundle = truebit.makeSimpleBundle(nonce, code, init, file);
      
      truebit.add(truebit.getInitHash(bundle), 1, 1, idToString(bundle));
   }

   function debugStuff() public returns (bytes32, bytes32, uint) {
      bytes32[] memory arr = new bytes32[](5);
      arr[0] = bytes32(msg.sender) & 0xff;
      arr[1] = block.blockhash(block.number-1) & 0xff;
      bytes32 file = truebit.createFileWithContents("input.data", nonce, arr, 100);
      nonce++;
      bytes32 bundle = truebit.makeSimpleBundle(nonce, code, init, file);
      
      uint id = truebit.add(truebit.getInitHash(bundle), 0, 1, idToString(bundle));
      // uint id = truebit.add(0, 0, 1, "asd");
      return (file, bundle, id);
   }
   
   function consume(uint /* file_id */, bytes32[] arr) public {
      val = arr[2];
      Success();
   }
   
   // this is the callback name
   function solved(uint /* id */, bytes32 /* result */, bytes32 file) public {
      // could check the task id
      truebit.forwardData(uint(file), this);
   }

}


