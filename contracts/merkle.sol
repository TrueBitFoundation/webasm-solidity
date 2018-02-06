pragma solidity ^0.4.19;

// generic merkle proofs for keccak256

contract Merkle {

   function bytes32ToBytes(bytes32 x) internal pure returns (bytes) {
     bytes memory res = new bytes(32);
     assembly {
       mstore(add(res,32), x)
     }
     return res;
   }

   function process(bytes32 leaf, bytes[] inst) internal pure returns (bytes32) {
      // first is the leaf
      for (uint i = 0; i+1 < inst.length; i += 2) {
         leaf = keccak256(inst[i], leaf, inst[i+1]);
      }
      return leaf;
   }
   
   function slice(bytes arr, uint i, uint n) internal pure returns (bytes) {
       bytes memory res = new bytes(n);
       for (uint j = 0; j < n; j++) res[j] = arr[i+j];
       return res;
   }
   
   function slice2(bytes arr, uint i1, uint i2) internal pure returns (bytes) {
       bytes memory res = new bytes(i2-i1);
       for (uint j = 0; j < i2-i1; j++) res[j] = arr[i1+j];
       return res;
   }
   
   // basically the merkle root of the argument has to be calculated
   // perhaps just require that it has to be padded?
   function process2(bytes32 leaf, uint[] ctrl, bytes inst) public pure returns (bytes32) {
      // first is the leaf
      for (uint i = 0; i+2 < ctrl.length; i += 2) {
         leaf = keccak256(slice2(inst, ctrl[i], ctrl[i+1]),
                          leaf,
                          slice2(inst, ctrl[i+1], ctrl[i+2]));
      }
      return leaf;
   }
   
   function getRoot(bytes32 leaf, uint[] ctrl, bytes inst, uint sz) public pure returns (bytes32) {
       return dataMerkle(0, sz);
   }
   
   function dataMerkle(uint idx, uint level) internal pure returns (bytes32) {
      if (level == 0) {
          if (idx*4+32 < msg.data.length) {
              // get the element
              bytes32 elem;
              uint d_idx = idx*4+32;
              assembly {
                  elem := calldataload(d_idx)
              }
              return keccak256(bytes16(elem), uint128(elem));
          }
          else return keccak256(bytes16(0), bytes16(0));
      }
      else return keccak256(dataMerkle(idx, level-1), dataMerkle(idx+(2**(level-1)), level-1));
   }

   function test(bytes dta) public pure returns (bytes32) {
       return keccak256(dta);
   }

   function test2(bytes dta, uint n) public pure {
       slice2(dta, 0, n);
   }

   function test3() public pure returns (bytes32) {
       return keccak256(bytes2(0x0));
   }

}
