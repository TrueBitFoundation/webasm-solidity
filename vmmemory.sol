pragma solidity ^0.4.15;

/**
* @title base class for ALU. holds a plethora of load and store methods that the WASM VM needs.
* @author Sami Mäkelä
*/
contract VMMemory {

    /**
    * @dev stores a and b in an array in memory(EVM memory), then returns the array instance
    *
      * @param a int value representing 8 bytes
      * @param b int value representing 8 bytes
    *
      * @return the array instance that holds a and b
    */
    function toMemory(uint a, uint b) internal pure returns (uint8[]) {
        uint8[] memory arr = new uint8[](16);
        storeN(arr, 0, 8, a);
        storeN(arr, 8, 8, b);
        return arr;
    }

    /**
      * @dev takes v and stores it in mem byte by byte lsB-first
    *
      * @param mem where v is going to be stored
      * @param addr address where v is going to be stored
      * @param n nummber of bytes v has
      * @param v the value that is going to be stored in mem
    *
    * @return none
    */
    function storeN(uint8[] mem, uint addr, uint n, uint v) internal pure {
        for (uint i = 0; i < n; i++) {
            mem[addr+i] = uint8(v);
            v = v/256;
        }
    }

    /**
    * @dev loads from mem
    *
      * @param mem where to load from
      * @param addr where to load the value from-the offset
      * @param n how many byte to load
    *
      * @return returns the loaded value
    */
    function loadN(uint8[] mem, uint addr, uint n) internal pure returns (uint) {
        uint res = 0;
        uint exp = 1;
        for (uint i = 0; i < n; i++) {
            res += mem[addr+i]*exp;
            exp = exp*256;
        }
        return res;
    }

    /**
      * @dev loads the first two 8-byte values from memory
    *
      * @param mem where to load the values from
    *
      * @return returns the two values
    */
    function fromMemory(uint8[] mem) internal pure returns (uint a, uint b) {
        a = loadN(mem, 0, 8);
        b = loadN(mem, 8, 8);
    }
    
    /**
      * @dev returns the sizes of different WASM types in bytes
    *
      * @param ty uint value represeting a WASM type
    *
      * @return the bumber of bytes ty has
    */
    function typeSize(uint ty) internal pure returns (uint) {
        if (ty == 0) return 4; // I32
        else if (ty == 1) return 8; // I64
        else if (ty == 2) return 4; // F32
        else if (ty == 3) return 8; // F64
    }
    
    /**
      * @dev stores v in mem with the given packing
    *
      * @param mem where to store v
      * @param addr the offset at which to store v inside mem
      * @param v the value to store in mem
      * @param ty the type of the value that is being stored in mem
      * @param packing number of bytes to pack to
    *
      * @return none
    */
    function store(uint8[] mem, uint addr, uint v, uint ty, uint packing) internal pure {
        if (packing == 0) storeN(mem, addr, typeSize(ty), v);
        else {
            // Only integers can be packed, also cannot pack I32 to 32-bit?
            require(ty < 2 && !(ty == 0 && packing == 4));
            storeN(mem, addr, packing, v);
        }
    }
    
    /**
      * @dev 
    *
      * @param mem where to store v
      * @param addr the offset at which to store v inside mem
      * @param v the value to store in mem
      * @param hint holds v's type and its packing value. bits 0-2 are packing value. bits 4 and 5 are value type.
    *
      * @return none
    */
    function storeX(uint8[] mem, uint addr, uint v, uint hint) internal pure {
        store(mem, addr, v, (hint/2**3)&0x3, hint&0x7);
    }
    
    /**
      * @dev load a value from mem with the proper type and packing
    *
      * @param mem where to load the value from
      * @param addr the offset at which to start reading the value from mem
      * @param ty the type of the value being loaded
      * @param packing the packing value or how many bytes to use to represent the loaded value
      * @param sign_extend should the value be sign-extended
    *
      * @return the loaded value
    */
    function load(uint8[] mem, uint addr, uint ty, uint packing, bool sign_extend) internal pure returns (uint) {
        if (packing == 0) return loadN(mem, addr, typeSize(ty));
        else {
            require(ty < 2 && !(ty == 0 && packing == 4));
            uint res = loadN(mem, addr, packing);
            if (sign_extend) {
                res = res | uint(-1)*2**(8*packing)*(res/2**(8*packing-1));
            }
            if (ty == 0) res = res % (2**32);
            else res = res % (2**64);
            return res;
        }
    }
    
    /**
      * @dev load a value from mem from offset address, uses extended hint filed for packing value
    *
      * @param mem where to load the value from
      * @param addr the offset at which to start loading the value from
      * @param hint extended hint. lsb denotes sign-extension. bits 1-3 denote the packing value. bits 4-5 denote value type.
    *
    * @return the loaded value
   */
    function loadX(uint8[] mem, uint addr, uint hint) internal pure returns (uint) {
        return load(mem, addr, (hint/2**4)&0x3, (hint/2)&0x7, hint&0x1 == 1);
    }
    
    /*
    function test(uint a, uint b) returns (uint, uint) {
        return fromMemory(toMemory(a,b));
    }*/
}

