pragma solidity ^0.4.16;

/* Calculate a merkle tree in solidity */

contract Input {
   bytes32[] zero;
   uint level;
   bytes32[][] data;
   function Input() public {
      zero.length = 32;
      zero[0] = bytes32(0);
      for (uint i = 1; i < 32; i++) {
         zero[i] = keccak256(zero[i-1], zero[i-1]);
      }
      data.length = 2;
      data[0].length = 2;
      data[1].length = 1;
      data[0][0] = zero[0];
      data[0][1] = zero[0];
      data[1][0] = zero[1];
   }
   function getRoot() public view returns (bytes32) {
      return data[data.length-1][0];
   }
   function getLeaf(uint loc) public view returns (bytes32) {
      return data[0][loc];
   }
   function expand() public {
      for (uint i = 0; i < data.length; i++) {
         data[i].length = data[i].length*2;
      }
      data[data.length-1][1] = zero[data.length-1];
      data.length++;
      data[data.length-1][0] = keccak256(data[data.length-2][0], data[data.length-2][1]);
   }
   function setLeaf(uint loc, bytes32 v) public {
      data[0][loc] = v;
      for (uint i = 1; i < data.length; i++) {
         loc = loc/2;
         bytes32 l1 = data[i-1][loc*2];
         bytes32 l2 = data[i-1][loc*2+1];
         if (l1 == 0) l1 = zero[i-1];
         if (l2 == 0) l2 = zero[i-1];
         data[i][loc] = keccak256(l1, l2);
      }
   }
}

