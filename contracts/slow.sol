pragma solidity ^0.4.15;

contract Test {
    function test(uint hint, uint r1, uint r2, uint r3) returns (uint) {
        uint res;
        if (hint == 2 || hint == 3 || hint == 4 || hint == 5) {
            if (r1 == r2 || r2 == r3) res = r1;
        }
        if (hint == 2 || hint == 3 || hint == 4 || hint == 5) {
            if (r1 == r2 || r2 == r3) res = r1;
        }
        if (hint == 2 || hint == 3 || hint == 4 || hint == 5) {
            if (r1 == r2 || r2 == r3) res = r1;
        }
        return res;
    }
}
