pragma solidity ^0.4.16;

/**
* @title
* @author Sami Mäkelä
*/
contract GetCode {
    /**
    * @dev get the task code
    *
    * @param a address of the task code
    *
    * @return return an array which holds the code of the task
    */
    function get(address a) public view returns (bytes) {
        uint len;
        assembly {
            len := extcodesize(a)
        }
        bytes memory bs = new bytes(len);
        assembly {
            extcodecopy(a, add(bs,32), 0, len)
        }
        return bs;
    }
}
