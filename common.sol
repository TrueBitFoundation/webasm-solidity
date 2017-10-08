pragma solidity ^0.4.15;

import "./offchain.sol";
import "./onchain.sol";
import "./alu.sol";

/**
  * @title
  * @author Sami Mäkelä
*/
contract REPLACEME, ALU {
  /**
    * @dev get a pointer for the place we want to perform a read from based on the opcode
  *
    * @param hint the opcode
  *
    * @return returns a pointer to where to read from
  */
    function readPosition(uint hint) internal view returns (uint) {
        assert(hint > 4);
        if (hint == 5) return getReg1();
        else if (hint == 6) return getStackPtr()-1;
        else if (hint == 7) return getStackPtr()-2;
        else if (hint == 8) return getStackPtr()-getReg1(); // Stack in reg
        else if (hint == 9) return getStackPtr()-getReg2();
        else if (hint == 14) return getCallPtr()-1;
        else if (hint == 15) return (getReg1()+getIreg())/8;
        else if (hint == 16) return getReg1();
        else if (hint == 17) return (getReg1()+getIreg())/8 + 1;
        else if (hint == 18) return getReg1();
        else if (hint == 19) return getReg1();
        else if (hint == 0x16) return getStackPtr()-3;
    }

    /**
      * @dev get a pointer to where we want to write to based on the opcode
    *
      * @param hint the opcode
    *
      * @return returns a pointer to where to write to
    */
    function writePosition(uint hint) internal view returns (uint) {
        assert(hint > 0);
        if (hint == 2) return getStackPtr()-getReg1();
        else if (hint == 3) return getStackPtr();
        else if (hint == 4) return getStackPtr()-1;
        else if (hint == 5) return getReg1()+getReg2();
        else if (hint == 6) return getCallPtr();
        else if (hint == 8) return getReg1();
        else if (hint == 9) return getStackPtr()-2;
        else if (hint & 0xc0 == 0x80) return (getReg1()+getIreg())/8;
        else if (hint & 0xc0 == 0xc0) return (getReg1()+getIreg())/8 + 1;
    }

    /**
      * @dev perform a read based on the opcode
    *
      * @param hint the opcode
    *
      * @return return the read value
    */
    function readFrom(uint hint) internal view returns (uint) {
        if (hint == 0) return 0;
        else if (hint == 1) return getIreg();
        else if (hint == 2) return getPC()+1;
        else if (hint == 3) return getStackPtr();
        else if (hint == 4) return getMemsize();
        // Add special cases for input data, input name
        else if (hint == 0x14) return getInputName(getReg1(), getReg2());
        else if (hint == 0x15) return getInputData(getReg1(), getReg2());
        uint loc = readPosition(hint);
        if (hint == 5) return getGlobal(loc);
        else if (hint == 6) return getStack(loc);
        else if (hint == 7) return getStack(loc);
        else if (hint == 8) return getStack(loc);
        else if (hint == 9) return getStack(loc);
        else if (hint == 14) return getCallStack(loc);
        else if (hint == 15) return getMemory(loc);
        else if (hint == 16) return getCallTable(loc);
        else if (hint == 17) return getMemory(loc);
        else if (hint == 18) return getCallTypes(loc);
        else if (hint == 19) return getInputSize(loc);
        else if (hint == 0x16) return getStack(loc);
    }

    /**
      * @dev make changes to a memory location
    *
      * @param loc where should be changed inside memory
      * @param v the value to change the memory position to
      * @param hint denoted v's type and packing value
    *
      * @return none
    */
    function makeMemChange1(uint loc, uint v, uint hint) internal  {
        uint old = getMemory(loc);
        uint8[] memory mem = toMemory(old, 0);
        storeX(mem, (getReg1()+getIreg())%8, v, hint);
        uint res; uint extra;
        (res, extra) = fromMemory(mem);
        setMemory(loc, res);
    }
    
    /**
      * @dev make changes to a memory location
    *
      * @param loc where should the write be performed
      * @param v the value to be written to memory
      * @param hint denotes v's type and packing value
    *
      * @return none
    */
    function makeMemChange2(uint loc, uint v, uint hint) internal {
        uint old = getMemory(loc);
        uint8[] memory mem = toMemory(0, old);
        storeX(mem, (getReg1()+getIreg())%8, v, hint);
        uint res; uint extra;
        (extra, res) = fromMemory(mem);
        setMemory(loc, res);
        
    }
    
    /**
      * @dev get a pointer to the palce we want to write to
    *
      * @param hint the opcode
    *
      * @return returns the pointer to where we want to write to
    */
    function writePosition(uint hint) internal view returns (uint) {
        assert(hint > 0);
        if (hint == 2) return getStackPtr()-getReg1();
        else if (hint == 3) return getStackPtr();
        else if (hint == 4) return getStackPtr()-1;
        else if (hint == 5) return getReg1()+getReg2();
        else if (hint == 6) return getCallPtr();
        else if (hint == 8) return getReg1();
        else if (hint == 9) return getStackPtr()-2;
        else if (hint == 0x0a) return getReg1();
        else if (hint == 0x0c) return getReg1();
        else if (hint & 0xc0 == 0x80) return (getReg1()+getIreg())/8;
        else if (hint & 0xc0 == 0xc0) return (getReg1()+getIreg())/8 + 1;
    }

    /**
      * @dev perform a write
    *
      * @param hint the opcode
      * @param v the value to be written
    *
      * @return none
    */
    function writeStuff(uint hint, uint v) internal {
        if (hint == 0) return;
        // Special cases for creation, other output
        if (hint == 0x0b) setInputName(getReg1(), getReg2(), v);
        if (hint == 0x0c) createInputData(getReg1(), v);
        if (hint == 0x0b) setInputData(getReg1(), getReg2(), v);
        uint loc = writePosition(hint);
        if (hint & 0xc0 == 0x80) makeMemChange1(loc, v, hint);
        else if (hint & 0xc0 == 0xc0) makeMemChange2(loc, v, hint);
        else if (hint == 2) setStack(loc, v);
        else if (hint == 3) setStack(loc, v);
        else if (hint == 4) setStack(loc, v);
        else if (hint == 6) setCallStack(loc, v);
        else if (hint == 8) setGlobal(loc, v);
        else if (hint == 9) setStack(loc, v);
        else if (hint == 0x0a) setInputSize(loc, v);
    }
    
    /**
      * @dev makes the necessary changes to a pointer based on the addressing mode provided by hint
    *
      * @param hint provides a hint as to what changes to make to the input pointer
      * @param ptr the pointer that's going to be handled
    *
      * @return returns the pointer after processing
    */
    function handlePointer(uint hint, uint ptr) internal view returns (uint) {
        if (hint == 0) return ptr - getReg1();
        else if (hint == 1) return getReg1();
        else if (hint == 2) return getReg2();
        else if (hint == 3) return getReg3();
        else if (hint == 4) return ptr+1;
        else if (hint == 5) return ptr-1;
        else if (hint == 6) return ptr;
        else if (hint == 7) return ptr-2;
        else if (hint == 8) return ptr-1-getIreg();
    }
    
    /**
      * @dev 
    *
      * @param op
    *
      * @return get the immediate value of an instruction
    */
    function getImmed(bytes32 op) internal pure returns (uint256) {
        // it is the first 8 bytes
        return uint(op)/(2**(13*8));
    }

    /**
      * @dev fetch an instruction
    *
      * @return none
    */
    function performFetch() internal {
        setOp(getCode(getPC()));
    }

    /**
      * @dev initialize the Truebit register machine's registers
    *
      * @return none
    */
    function performInit() internal  {
        setReg1(0);
        setReg2(0);
        setReg3(0);
        setIreg(getImmed(getOp()));
    }
    
    /**
      * @dev get the opcode
    *
      * @param n which opcode byte to read
    *
      * @return returns the opcode
    */
    function getHint(uint n) internal view returns (uint) {
        return (uint(getOp())/2**(8*n))&0xff;
    }
    
    /**
      * @dev read the first byte of the opcode and then read the value based on the hint into REG1
    *
      * @return 
    */
    function performRead1() internal {
        setReg1(readFrom(getHint(0)));
    }

    /**
      * @dev read the second byte of the opcode and then read the value based on the hint into REG2
    *
      * @return 
    */
    function performRead2() internal {
        setReg2(readFrom(getHint(1)));
    }

    /**
      * @dev read the third byte of the opcode and then read the vlaue based on the hint into REG3
    *
      * @return 
    */
    function performRead3() internal {
        setReg3(readFrom(getHint(2)));
    }
    
    /**
      * @dev execute the opcode, put the result back in REG1
    *
      * @return none
    */
    function performALU() internal {
        setReg1(handleALU(getHint(3), getReg1(), getReg2(), getReg3(), getIreg()));
        debug = getHint(3);
    }
    
    /**
      * @dev write a value stored in REG to a location using the 4th and 5th hint bytes
    *
      * @return none
    */
    function performWrite1() internal {
        uint target = getHint(4);
        uint hint = getHint(5);
        uint v;
        if (target == 1) v = getReg1();
        if (target == 2) v = getReg2();
        if (target == 3) v = getReg3();
        writeStuff(hint, v);
    }

    /**
      * @dev write a value stored in REG to a location using the 6th and 7th hint bytes
    *
      * @return none
    */
    function performWrite2() internal {
        uint target = getHint(6);
        uint hint = getHint(7);
        uint v;
        if (target == 1) v = getReg1();
        if (target == 2) v = getReg2();
        if (target == 3) v = getReg3();
        writeStuff(hint, v);
    }
    
    /**
      * @dev updates the programm counter
    *
      * @return none
    */
    function performUpdatePC() internal {
        setPC(handlePointer(getHint(11), getPC()));
    }

    /**
      * @dev updates the stack pointer
    *
      * @return none
    */
    function performUpdateStackPtr() internal {
        setStackPtr(handlePointer(getHint(9), getStackPtr()));
    }

    /**
      * @dev updates the call pointer
    *
      * @return none
    */
    function performUpdateCallPtr() internal {
        setCallPtr(handlePointer(getHint(8), getCallPtr()));
    }

    /**
      * @dev updates the linear memory size
    *
      * @return none
    */
    function performUpdateMemsize() internal {
        if (getHint(12) == 1) setMemsize(getMemsize()+getReg1());
    }
    
    uint phase;
    
    /**
      * @dev runs the phases of the Truebit register machine
    *
      * @return none
    */
    function performPhase() internal {
        if (phase == 0) performFetch();
        if (phase == 1) performInit();
        if (phase == 2) performRead1();
        if (phase == 3) performRead2();
        if (phase == 4) performRead3();
        if (phase == 5) performALU();
        if (phase == 6) performWrite1();
        if (phase == 7) performWrite2();
        if (phase == 8) performUpdatePC();
        if (phase == 9) performUpdateStackPtr();
        if (phase == 10) performUpdateCallPtr();
        if (phase == 11) performUpdateMemsize();
        phase = (phase+1) % 12;
    }
}

