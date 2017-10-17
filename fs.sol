pragma solidity ^0.4.16;

/* Calculate a merkle tree in solidity */

contract Filesystem {
   bytes32[] zero;
   struct File {
     uint size;
     bytes32[][] data;
     string name;
   }
   File[] files;
   function Filesystem() public {
      zero.length = 32;
      zero[0] = bytes32(0);
      for (uint i = 1; i < 32; i++) {
         zero[i] = keccak256(zero[i-1], zero[i-1]);
      }
   }
   
   function createFile(string name) public returns (uint) {
      files.length++;
      uint id = files.length;
      File storage f = files[id];
      f.data.length = 2;
      f.data[0].length = 2;
      f.data[1].length = 1;
      f.data[0][0] = zero[0];
      f.data[0][1] = zero[0];
      f.data[1][0] = zero[1];
      f.size = 0;
      f.name = name;
   }
   
   function expand(uint id) internal {
      File storage f = files[id];
      for (uint i = 0; i < f.data.length; i++) {
         f.data[i].length = f.data[i].length*2;
      }
      f.data[f.data.length-1][1] = zero[f.data.length-1];
      f.data.length++;
      f.data[f.data.length-1][0] = keccak256(f.data[f.data.length-2][0], f.data[f.data.length-2][1]);
   }
   
   function setSize(uint id, uint sz) public {
      File storage f = files[id];
      while (2 ** f.data.length < sz) expand(id);
      f.size = sz;
   }
   
   function getName(uint id) public view returns (string) {
      return files[id].name;
   }
   
   function getData(uint id) public view returns (uint[]) {
      File storage f = files[id];
      uint[] memory res = new uint[](f.size);
      for (uint i = 0; i < f.size; i++) res[i] = uint(f.data[0][i]);
      return res;
   }

   function getRoot(uint id) public view returns (bytes32) {
      File storage f = files[id];
      return f.data[f.data.length-1][0];
   }
   function getLeaf(uint id, uint loc) public view returns (bytes32) {
      File storage f = files[id];
      return f.data[0][loc];
   }
   function setLeaf(uint id, uint loc, bytes32 v) public {
      File storage f = files[id];
      f.data[0][loc] = v;
      for (uint i = 1; i < f.data.length; i++) {
         loc = loc/2;
         bytes32 l1 = f.data[i-1][loc*2];
         bytes32 l2 = f.data[i-1][loc*2+1];
         if (l1 == 0) l1 = zero[i-1];
         if (l2 == 0) l2 = zero[i-1];
         f.data[i][loc] = keccak256(l1, l2);
      }
   }
}

