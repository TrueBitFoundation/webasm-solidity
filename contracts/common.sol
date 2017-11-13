pragma solidity ^0.4.15;

import "./offchain.sol";
import "./onchain.sol";
import "./alu.sol";

contract REPLACEME, ALU {
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
        else assert(false);
    }

    function readFrom(uint hint) internal view returns (uint) {
        if (hint == 0) return 0;
        else if (hint == 1) return getIreg();
        else if (hint == 2) return getPC()+1;
        else if (hint == 3) return getStackPtr();
        else if (hint == 4) return getMemsize();
        // Add special cases for input data, input name
        else if (hint == 0x14) return getInputName(getReg2(), getReg1());
        else if (hint == 0x15) return getInputData(getReg2(), getReg1());
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
        else assert(false);
    }

    function makeMemChange1(uint loc, uint v, uint hint) internal  {
        uint old = getMemory(loc);
        uint8[] memory mem = toMemory(old, 0);
        storeX(mem, (getReg1()+getIreg())%8, v, hint);
        uint res; uint extra;
        (res, extra) = fromMemory(mem);
        setMemory(loc, res);
    }
    
    function makeMemChange2(uint loc, uint v, uint hint) internal {
        uint old = getMemory(loc);
        uint8[] memory mem = toMemory(0, old);
        storeX(mem, (getReg1()+getIreg())%8, v, hint);
        uint res; uint extra;
        (extra, res) = fromMemory(mem);
        setMemory(loc, res);
        
    }
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
        else if (hint == 0x0e) return getIreg();
        else if (hint == 0x0f) return getIreg();
        else if (hint & 0xc0 == 0x80) return (getReg1()+getIreg())/8;
        else if (hint & 0xc0 == 0xc0) return (getReg1()+getIreg())/8 + 1;
        else assert(false);
    }
    
    function writeStuff(uint hint, uint v) internal {
        if (hint == 0) return;
        // Special cases for creation, other output
        if (hint == 0x0b) setInputName(getReg1(), getReg2(), v);
        else if (hint == 0x0c) createInputData(getReg1(), v);
        else if (hint == 0x0d) setInputData(getReg1(), getReg2(), v);
        else if (hint == 0x10) setStackSize(v);
        else if (hint == 0x11) setCallStackSize(v);
        else if (hint == 0x12) setGlobalsSize(v);
        else if (hint == 0x13) setTableSize(v);
        else if (hint == 0x14) setTableTypesSize(v);
        else if (hint == 0x15) setMemorySize(v);
        else {
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
          else if (hint == 0x0e) setCallTable(loc, v);
          else if (hint == 0x0f) setCallType(loc, v);
          else assert(false);
        }
    }
    
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
        else assert(false);
    }
    
    function getImmed(bytes32 op) internal pure returns (uint256) {
        // it is the first 8 bytes
        return uint(op)/(2**(13*8));
    }

    function performFetch() internal {
        setOp(getCode(getPC()));
    }

    function performInit() internal  {
        setReg1(0);
        setReg2(0);
        setReg3(0);
        setIreg(getImmed(getOp()));
    }
    
    function getHint(uint n) internal view returns (uint) {
        return (uint(getOp())/2**(8*n))&0xff;
    }
    
    function performRead1() internal {
        setReg1(readFrom(getHint(0)));
    }
    function performRead2() internal {
        setReg2(readFrom(getHint(1)));
    }
    function performRead3() internal {
        setReg3(readFrom(getHint(2)));
    }
    
    function performALU() internal {
        setReg1(handleALU(getHint(3), getReg1(), getReg2(), getReg3(), getIreg()));
        debug = getHint(3);
    }
    
    function performWrite1() internal {
        uint target = getHint(4);
        uint hint = getHint(5);
        uint v;
        if (target == 1) v = getReg1();
        if (target == 2) v = getReg2();
        if (target == 3) v = getReg3();
        writeStuff(hint, v);
    }
    function performWrite2() internal {
        uint target = getHint(6);
        uint hint = getHint(7);
        uint v;
        if (target == 1) v = getReg1();
        if (target == 2) v = getReg2();
        if (target == 3) v = getReg3();
        writeStuff(hint, v);
    }
    
    function performUpdatePC() internal {
        setPC(handlePointer(getHint(11), getPC()));
    }
    function performUpdateStackPtr() internal {
        setStackPtr(handlePointer(getHint(9), getStackPtr()));
    }
    function performUpdateCallPtr() internal {
        setCallPtr(handlePointer(getHint(8), getCallPtr()));
    }
    function performUpdateMemsize() internal {
        if (getHint(12) == 1) setMemsize(getMemsize()+getReg1());
    }
    
    uint phase;
    
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

