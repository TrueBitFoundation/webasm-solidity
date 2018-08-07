pragma solidity ^0.4.23;

contract A {
    function foo() external pure returns (uint) {
        return 123;
    }
}

contract Test {
    constructor() public {
       A a = new A();
       a.foo();
    }
   
}

