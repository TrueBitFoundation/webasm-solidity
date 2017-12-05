pragma solidity ^0.4.17;

contract Test {
    bytes32[] blah;
    function test2() public returns (bytes32) {
        for (uint i = 0; i < 1000; i++) blah.push(123);
        return bytes32(123);
   }
   
}

