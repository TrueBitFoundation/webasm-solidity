
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <assert.h>

uint8_t popcnt32(uint32_t r1)  {
    uint32_t temp = r1;
    temp = (temp & 0x55555555) + ((temp >> 1) & 0x55555555);
    temp = (temp & 0x33333333) + ((temp >> 2) & 0x33333333);
    temp = (temp & 0x0f0f0f0f) + ((temp >> 4) & 0x0f0f0f0f);
    temp = (temp & 0x00ff00ff) + ((temp >> 8) & 0x00ff00ff);
    temp = (temp & 0x0000ffff) + ((temp >> 16) & 0x0000ffff);
    return temp;
}

uint8_t popcnt64(uint64_t r1)  {
    uint64_t temp = r1;
    temp = (temp & 0x5555555555555555) + ((temp >> 1) & 0x5555555555555555);
    temp = (temp & 0x3333333333333333) + ((temp >> 2) & 0x3333333333333333);
    temp = (temp & 0x0f0f0f0f0f0f0f0f) + ((temp >> 4) & 0x0f0f0f0f0f0f0f0f);
    temp = (temp & 0x00ff00ff00ff00ff) + ((temp >> 8) & 0x00ff00ff00ff00ff);
    temp = (temp & 0x0000ffff0000ffff) + ((temp >> 16) & 0x0000ffff0000ffff);
    temp = (temp & 0x00000000ffffffff) + ((temp >> 32) & 0x00000000ffffffff);
    return temp;
}

uint8_t clz32(uint32_t r1) {
    if (r1 == 0) return 32;
    uint32_t temp_r1 = r1;
    uint8_t n = 0;
    if ((temp_r1 & 0xffff0000) == 0) {
      n += 16;
      temp_r1 = temp_r1 << 16;
    }
    if ((temp_r1 & 0xff000000) == 0) {
      n += 8;
      temp_r1 = temp_r1 << 8;
    }
    if ((temp_r1 & 0xf0000000) == 0) {
      n += 4;
      temp_r1 = temp_r1 << 4;
    }
    if ((temp_r1 & 0xc0000000) == 0) {
      n += 2;
      temp_r1 = temp_r1 << 2;
    }
    if ((temp_r1 & 0x8000000) == 0) {
      n++;
    }
    return n;
}

uint8_t clz64(uint64_t r1) {
    if (r1 == 0) return 64;
    uint64_t temp_r1 = r1;
    uint8_t n = 0;
    if ((temp_r1 & 0xffffffff00000000) == 0) {
      n += 32;
      temp_r1 = temp_r1 << 32;
    }
    if ((temp_r1 & 0xffff000000000000) == 0) {
      n += 16;
      temp_r1 == temp_r1 << 16;
    }
    if ((temp_r1 & 0xff00000000000000) == 0) {
      n+= 8;
      temp_r1 = temp_r1 << 8;
    }
    if ((temp_r1 & 0xf000000000000000) == 0) {
      n += 4;
      temp_r1 = temp_r1 << 4;
    }
    if ((temp_r1 & 0xc000000000000000) == 0) {
      n += 2;
      temp_r1 = temp_r1 << 2;
    }
    if ((temp_r1 & 0x8000000000000000) == 0) {
      n += 1;
    }
    return n;
}

uint8_t ctz32(uint32_t r1) {
    if (r1 == 0) return 32;
    uint32_t temp_r1 = r1;
    uint8_t n = 0;
    if ((temp_r1 & 0x0000ffff) == 0) {
      n += 16;
      temp_r1 = temp_r1 >> 16;
    }
    if ((temp_r1 & 0x000000ff) == 0) {
      n += 8;
      temp_r1 = temp_r1 >> 8;
    }
    if ((temp_r1 & 0x0000000f) == 0) {
      n += 4;
      temp_r1 = temp_r1 >> 4;
    }
    if ((temp_r1 & 0x00000003) == 0) {
      n += 2;
      temp_r1 = temp_r1 >> 2;
    }
    if ((temp_r1 & 0x00000001) == 0) {
      n += 1;
    }
    return n;
}

uint8_t ctz64(uint64_t r1) {
    if (r1 == 0) return 64;
    uint64_t temp_r1 = r1;
    uint8_t n = 0;
    if (temp_r1 & 0x00000000ffffffff == 0) {
      n += 32;
      temp_r1 = temp_r1 >> 32;
    }
    if (temp_r1 & 0x000000000000ffff == 0) {
      n += 16;
      temp_r1 = temp_r1 >> 16;
    }
    if (temp_r1 & 0x00000000000000ff == 0) {
      n += 8;
      temp_r1 = temp_r1 >> 8;
    }
    if (temp_r1 & 0x000000000000000f == 0) {
      n += 4;
      temp_r1 = temp_r1 >> 4;
    }
    if (temp_r1 & 0x0000000000000003 == 0) {
      n += 2;
      temp_r1 = temp_r1 >> 2;
    }
    if (temp_r1 & 0x0000000000000001 == 0) {
      n += 1;
    }
    return n;
}

int error_code = 0;

uint8_t tmp_mem[16];

void storeN(uint8_t *mem, uint64_t addr, uint64_t n, uint64_t v) {
    for (int i = 0; i < n; i++) {
            mem[addr+i] = v;
            v = v >> 8;
    }
}

// a and b are integer values that represent 8 bytes each
uint8_t *toMemory(uint64_t a, uint64_t b) {
        storeN(tmp_mem, 0, 8, a);
        storeN(tmp_mem, 8, 8, b);
        return tmp_mem;
}

uint64_t loadN(uint8_t *mem, uint64_t addr, uint64_t n) {
        uint64_t res = 0;
        uint64_t exp = 1;
        for (int i = 0; i < n; i++) {
            // printf("Byte %02x\n", mem[addr+i]);
            res += mem[addr+i]*exp;
            exp = exp << 8;
        }
        return res;
}

uint64_t fromMemory1(uint8_t *mem) {
        return loadN(mem, 0, 8);
}

uint64_t fromMemory2(uint8_t *mem) {
        return loadN(mem, 8, 8);
}

uint64_t typeSize(uint64_t ty) {
        if (ty == 0) return 4; // I32
        else if (ty == 1) return 8; // I64
        else if (ty == 2) return 4; // F32
        else if (ty == 3) return 8; // F64
}

void store(uint8_t *mem, uint64_t addr, uint64_t v, uint64_t ty, uint64_t packing) {
        if (packing == 0) storeN(mem, addr, typeSize(ty), v);
        else {
            // Only integers can be packed, also cannot pack I32 to 32-bit?
            assert(ty < 2 && !(ty == 0 && packing == 4));
            storeN(mem, addr, packing, v);
        }
}

void storeX(uint8_t *mem, uint64_t addr, uint64_t v, uint64_t hint) {
        store(mem, addr, v, (hint >> 3)&0x3, hint&0x7);
}

uint64_t load(uint8_t *mem, uint64_t addr, uint64_t ty, uint64_t packing, uint8_t sign_extend) {
        if (packing == 0) return loadN(mem, addr, typeSize(ty));
        else {
            assert(ty < 2 && !(ty == 0 && packing == 4));
            uint64_t res = loadN(mem, addr, packing);
            if (sign_extend) {
                res = res | (0xffffffffffffffff << (8*packing))*(res >> (8*packing-1));
            }
            if (ty == 0) res = res & 0xffffffff;
            else res = res & 0xffffffffffffffff;
            return res;
        }
}
    
uint64_t loadX(uint8_t *mem, uint64_t addr, uint64_t hint) {
        return load(mem, addr, (hint >> 4)&0x3, (hint >> 1)&0x7, hint&0x1 == 1);
}

uint64_t handleALU(uint8_t hint, uint64_t r1, uint64_t r2, uint64_t r3, uint64_t ireg) {
        uint64_t res;
        // fprintf(stderr, "ALU %x, R1 %ld, R2 %ld\n", hint, r1, r2);
        if (hint == 0) return r1;
        else if (hint == 1 || hint == 6) {
           error_code = 1; // Trap
           return 0;
        }
        // Loading from memory
        else if ((hint & 0xc0) == 0xc0) {
            uint8_t *arr = toMemory(r2, r3);
            res = loadX(arr, (r1+ireg)&0x7, hint);
        }
        else if (hint == 2) {
            if (r1 < r2) res = r1;
            else res = r2;
        }
        // Calculate conditional jump
        else if (hint == 3) {
            if (r2 != 0) res = r1;
            else res = r3;
            // fprintf(stderr, "JumpI to %d. R2 was %ld\n", res, r2);
        }
        // Calculate jump to jump table
        else if (hint == 4) {
            res = r2 + (r1 >= ireg ? ireg : r1);
        }
        // Check dynamic call
        else if (hint == 7) {
            if (ireg != r2) assert(0);
            res = 0;
        }
        else if (hint == 0x45 || hint == 0x50) {
            if (r1 == 0) res = 1;
            else res = 0;
        }
        else if (hint == 0x46 || hint == 0x51) {
            if (r1 == r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x47 || hint == 0x52) {
            if (r1 != r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x48) {
            if ((int32_t)r1 < (int32_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x49) {
            if ((uint32_t)r1 < (uint32_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x4a) {
            if ((int32_t)r1 > (int32_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x4b) {
            if ((uint32_t)r1 > (uint32_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x4c) {
            if ((int32_t)r1 <= (int32_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x4d) {
            if ((uint32_t)r1 <= (uint32_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x4e) {
            if ((int32_t)r1 >= (int32_t)r2) res = 1;
            else res = 0;
            // printf("Result %d\n", res);
        }
        else if (hint == 0x4f) {
            if ((uint32_t)r1 >= (uint32_t)r2) res = 1;
            else res = 0;
        }

        else if (hint == 0x53) {
            if ((int64_t)r1 < (int64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x54) {
            if ((uint64_t)r1 < (uint64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x55) {
            if ((int64_t)r1 > (int64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x56) {
            if ((uint64_t)r1 > (uint64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x57) {
            if ((int64_t)r1 <= (int64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x58) {
            if ((uint64_t)r1 <= (uint64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x59) {
            if ((int64_t)r1 >= (int64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x5a) {
            if ((uint64_t)r1 >= (uint64_t)r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x67) {
            res = clz32((uint32_t)r1);
        }
        else if (hint == 0x68) {
            res = ctz32((uint32_t)r1);
        }
        else if (hint == 0x69) {
            res = popcnt32((uint32_t)r1);
        }
        else if (hint == 0x79) {
            res = clz64((uint64_t)r1);
        }
        else if (hint == 0x7a) {
            res = ctz64((uint64_t)r1);
        }
        else if (hint == 0x7b) {
            res = popcnt64((uint64_t)r1);
        }
        else if (hint == 0x6a || hint == 0x7c) {
            res = r1+r2;
        }
        else if (hint == 0x6b || hint == 0x7d) {
            res = r1-r2;
        }
        else if (hint == 0x6c || hint == 0x7e) {
            res = r1*r2;
        }
        else if (hint == 0x6d) {
            res = (uint64_t)((int32_t)r1/(int32_t)r2);
        }
        else if (hint == 0x7f) {
            res = (uint64_t)((int64_t)r1/(int64_t)r2);
        }
        else if (hint == 0x6e || hint == 0x80) {
            res = r1/r2;
        }
        else if (hint == 0x6f) {
            res = (uint64_t)((int32_t)r1%(int32_t)r2);
        }
        else if (hint == 0x81) {
            res = (uint64_t)((int64_t)r1%(int64_t)r2);
        }
        else if (hint == 0x70 || hint == 0x82) {
            res = r1%r2;
        }
        else if (hint == 0x71 || hint == 0x83) {
            res = r1&r2;
        }
        else if (hint == 0x72 || hint == 0x84) {
            res = r1|r2;
        }
        else if (hint == 0x73 || hint == 0x85) {
            res = r1^r2;
        }
        else if (hint == 0x74 || hint == 0x86) {
            res = r1 << r2; // shift 
        }
        else if (hint == 0x75 || hint == 0x87) {
            res = r1 >> r2;
        }
        else if (hint == 0x76 || hint == 0x88) {
            res = r1 >> r2;
        }
        // rol, ror -- fix
        else if (hint == 0x77) {
            res = (r1<<r2) | (r1>>(32-r2));
        }
        else if (hint == 0x78) {
            res = (r1>>r2) | (r1<<(32-r2));
        }
        else if (hint == 0x89) {
            res = (r1<<r2) | (r1<<(64-r2));
        }
        else if (hint == 0x8a) {
            res = (r1>>r2) | (r1<<(64-r2));
        }
        
        if (hint >= 0x62 && hint <= 0x78) {
            res = res & 0xffffffff;
        }
        else if (hint >= 0x7c && hint <= 0x8a) {
            res = res & 0xffffffffffffffff;
        }
        return res;
}

struct vm_t {
  uint64_t reg1;
  uint64_t reg2;
  uint64_t reg3;
  uint64_t ireg;
  
  uint8_t *op;
  
  uint64_t stack_ptr;
  uint64_t call_ptr;
  uint64_t pc;
  uint64_t memsize;
  
  uint64_t *globals;
  uint64_t *stack;
  uint64_t *callstack;
  uint64_t *memory;
  uint64_t *calltable;
  uint64_t *calltypes;
  
  uint64_t *inputsize;
  uint8_t **inputname;
  uint8_t **inputdata;

  uint8_t *code;
};

struct vm_t vm;

uint64_t readPosition(uint8_t hint) {
        assert(hint > 4);
        if (hint == 5) return vm.reg1;
        else if (hint == 6) return vm.stack_ptr-1;
        else if (hint == 7) return vm.stack_ptr-2;
        else if (hint == 8) return vm.stack_ptr-vm.reg1; // Stack in reg
        else if (hint == 9) return vm.stack_ptr-vm.reg2;
        else if (hint == 14) return vm.call_ptr-1;
        else if (hint == 15) return (vm.reg1+vm.reg2) >> 3;
        else if (hint == 16) return vm.reg1;
        else if (hint == 17) return (vm.reg1+vm.ireg) >> 3 + 1;
        else if (hint == 18) return vm.reg1;
        else if (hint == 19) return vm.reg1;
        else if (hint == 0x16) return vm.stack_ptr-3;
        assert(0);
}

uint64_t readFrom(uint8_t hint) {
  // fprintf(stderr, "read hint %x\n", hint);
        if (hint == 0) return 0;
        else if (hint == 1) return vm.ireg;
        else if (hint == 2) return vm.pc+1;
        else if (hint == 3) return vm.stack_ptr;
        else if (hint == 4) return vm.memsize;
        // Add special cases for input data, input name
        else if (hint == 0x14) {
          fprintf(stderr, "Getting from name %s\n", vm.inputname[vm.reg2]);
          return vm.inputname[vm.reg2][vm.reg1];
        }
        else if (hint == 0x15) return vm.inputdata[vm.reg2][vm.reg1];
        uint64_t loc = readPosition(hint);
        if (hint == 5) return vm.globals[loc];
        else if (hint == 6) return vm.stack[loc];
        else if (hint == 7) return vm.stack[loc];
        else if (hint == 8) return vm.stack[loc];
        else if (hint == 9) return vm.stack[loc];
        else if (hint == 14) return vm.callstack[loc];
        else if (hint == 15) return vm.memory[loc];
        else if (hint == 16) return vm.calltable[loc];
        else if (hint == 17) return vm.memory[loc];
        else if (hint == 18) return vm.calltypes[loc];
        else if (hint == 19) return vm.inputsize[loc];
        else if (hint == 0x16) return vm.stack[loc];
        assert(0);
}

void makeMemChange1(uint64_t loc, uint64_t v, uint8_t hint) {
        uint64_t old = vm.memory[loc];
        uint8_t *mem = toMemory(old, 0);
        storeX(mem, (vm.reg1+vm.ireg)&0x7, v, hint);
        vm.memory[loc] = fromMemory1(mem);
}

void makeMemChange2(uint64_t loc, uint64_t v, uint8_t hint) {
        uint64_t old = vm.memory[loc];
        uint8_t *mem = toMemory(0, old);
        storeX(mem, (vm.reg1+vm.ireg)&0x7, v, hint);
        vm.memory[loc] = fromMemory2(mem);
}

uint64_t writePosition(uint8_t hint) {
        assert(hint > 0);
        if (hint == 2) return vm.stack_ptr-vm.reg1;
        else if (hint == 3) return vm.stack_ptr;
        else if (hint == 4) return vm.stack_ptr-1;
        else if (hint == 5) return vm.reg1+vm.reg2;
        else if (hint == 6) return vm.call_ptr;
        else if (hint == 8) return vm.reg1;
        else if (hint == 9) return vm.stack_ptr-2;
        else if (hint == 0x0a) return vm.reg1;
        else if (hint == 0x0c) return vm.reg1;
        else if (hint == 0x0e) return vm.ireg;
        else if (hint == 0x0f) return vm.ireg;
        else if ((hint & 0xc0) == 0x80) return (vm.reg1+vm.ireg) >> 3;
        else if ((hint & 0xc0) == 0xc0) return (vm.reg1+vm.ireg) >> 3 + 1;
        assert(0);
    }
    
void writeStuff(uint8_t hint, uint64_t v) {
        if (hint == 0) return;
        // Special cases for creation, other output
        if (hint == 0x0b) {
          vm.inputname[vm.reg1][vm.reg2] = v;
          return;
        }
        if (hint == 0x0c) {
          vm.inputdata[vm.reg1] = (uint8_t*)malloc(v*sizeof(uint8_t));
          vm.inputsize[vm.reg1] = v;
          return;
        }
        if (hint == 0x0d) {
          vm.inputdata[vm.reg1][vm.reg2] = v;
          return;
        }
        uint64_t loc = writePosition(hint);
        // fprintf(stderr, "Loc: %ld, hint %x\n", loc, hint);
        if ((hint & 0xc0) == 0x80) makeMemChange1(loc, v, hint);
        else if ((hint & 0xc0) == 0xc0) makeMemChange2(loc, v, hint);
        else if (hint == 2) vm.stack[loc] = v;
        else if (hint == 3) {
          vm.stack[loc] = v;
        }
        else if (hint == 4) vm.stack[loc] = v;
        else if (hint == 6) vm.callstack[loc] = v;
        else if (hint == 8) vm.globals[loc] = v;
        else if (hint == 9) vm.stack[loc] = v;
        else if (hint == 0x0a) vm.inputsize[loc] = v;
        else if (hint == 0x0e) {
          // fprintf(stderr, "Call t %x\n", (uint)vm.calltable);
          vm.calltable[loc] = v;
          // fprintf(stderr, "Call t %x\n", (uint)vm.calltable);
        }
        else if (hint == 0x0f) vm.calltypes[loc] = v;
        // fprintf(stderr, "worked?\n");
}
    
uint64_t handlePointer(uint8_t hint, uint64_t ptr) {
        if (hint == 0) return ptr - vm.reg1;
        else if (hint == 1) return vm.reg1;
        else if (hint == 2) return vm.reg2;
        else if (hint == 3) return vm.reg3;
        else if (hint == 4) return ptr+1;
        else if (hint == 5) return ptr-1;
        else if (hint == 6) return ptr;
        else if (hint == 7) return ptr-2;
        else if (hint == 8) return ptr-1-vm.ireg;
}
    
uint64_t getImmed(uint8_t *op) {
   // it is the first 8 bytes
   uint64_t res = 0;
   for (int i = 0; i < 8; i++) {
     res = (res<<8) + op[11+i];
   }
   return res;
}

void performFetch() {
  vm.op = &vm.code[vm.pc*32];
}

void printOp() {
  for (int i = 0; i < 32; i++) {
    printf("%02x", vm.op[i]);
  }
  printf(" <- this is the op, immed %lx\n", getImmed(vm.op));
}

void performInit() {
   vm.reg1 = 0;
   vm.reg2 = 0;
   vm.reg3 = 0;
   vm.ireg = getImmed(vm.op);
}

uint8_t getHint(uint8_t n) {
        return vm.op[31-n];
}

void performRead1() {
   vm.reg1 = readFrom(getHint(0));
   // fprintf(stderr, "reg1 %lx\n", vm.reg1);
}
void performRead2() {
   vm.reg2 = readFrom(getHint(1));
}
void performRead3() {
   vm.reg3 = readFrom(getHint(2));
}

void performALU() {
   vm.reg1 = handleALU(getHint(3), vm.reg1, vm.reg2, vm.reg3, vm.ireg);
}

void performWrite1() {
        uint8_t target = getHint(4);
        uint8_t hint = getHint(5);
        uint64_t v;
        // printf("target %d, hint %x\n", target, hint);
        // printf("reg1: %ld\n", vm.reg1);
        if (target == 1) {
          v = vm.reg1;
        }
        else if (target == 2) {
          v = vm.reg2;
        }
        else if (target == 3) v = vm.reg3;
        else {
          assert(0);
        }
        // printf("what is it ???\n");
        writeStuff(hint, v);
}

void performWrite2() {
        uint8_t target = getHint(6);
        uint8_t hint = getHint(7);
        uint64_t v;
        if (target == 1) v = vm.reg1;
        else if (target == 2) v = vm.reg2;
        else if (target == 3) v = vm.reg3;
        else assert(0);
        writeStuff(hint, v);
}
        
void performUpdatePC() {
    vm.pc = handlePointer(getHint(11), vm.pc);
}

void performUpdateStackPtr() {
    // fprintf(stderr, "stack hint %x\n", getHint(9));
    vm.stack_ptr = handlePointer(getHint(9), vm.stack_ptr);
}

void performUpdateCallPtr() {
    vm.call_ptr = handlePointer(getHint(8), vm.call_ptr);
}

void performUpdateMemsize() {
    if (getHint(12) == 1) vm.memsize = vm.memsize + vm.reg1;
}
    
void performStep() {
        performFetch();
        if (getHint() == 0x06) return;
        performInit();
        // printf("Reading\n");
        performRead1();
        performRead2();
        performRead3();
        performALU();
        // printf("Writing 1\n");
        performWrite1();
        // printf("Writing 2\n");
        performWrite2();
        // printf("Updating\n");
        performUpdatePC();
        performUpdateStackPtr();
        performUpdateCallPtr();
        performUpdateMemsize();
}

void init() {
  vm.globals = malloc(sizeof(uint64_t)*1024);
  vm.stack = malloc(sizeof(uint64_t)*1024*1024*10);
  vm.callstack = malloc(sizeof(uint64_t)*1024*1024);
  vm.memory = malloc(sizeof(uint64_t)*1024*1024*100);
  vm.calltable = malloc(sizeof(uint64_t)*1024*1024);
  vm.calltypes = malloc(sizeof(uint64_t)*1024*1024);
  
  vm.inputsize = malloc(sizeof(uint64_t)*1024);
  vm.inputname = malloc(sizeof(uint64_t*)*1024);
  vm.inputdata = malloc(sizeof(uint64_t*)*1024);
  
  printf("Stack %x\n", (uint)vm.stack);
  printf("Call t %x\n", (uint)vm.calltable);

/*  vm.reg1;
  uint64_t reg2;
  uint64_t reg3;
  uint64_t ireg;
*/

  vm.stack_ptr = 0;
  vm.call_ptr = 0;
  vm.pc = 0;
  vm.memsize = 1024*100*8;

}

uint8_t *readFile(char *name, uint64_t *sz) {
  FILE *f = fopen(name, "rb");
  fseek(f, 0, SEEK_END);
  long fsize = ftell(f);
  fseek(f, 0, SEEK_SET);  //same as rewind(f);
  
  fprintf(stderr, "Loading file %s: size %d\n", name, (int)fsize);

  uint8_t *res = malloc(fsize);
  fread(res, fsize, 1, f);
  fclose(f);
  
  *sz = fsize;
  
  return res;
}

int main(int argc, char **argv) {
  init();
  // Load code from file
  uint64_t sz = 0;
  vm.code = readFile("decoded.bin", &sz);

  // Load files to input
  for (int i = 1; i < argc; i++) {
     vm.inputname[i-1] = argv[i];
     vm.inputdata[i-1] = readFile(argv[i], &sz);
     vm.inputsize[i-1] = sz;
  }
     vm.inputname[argc-1] = "";
     vm.inputdata[argc-1] = "";
     vm.inputsize[argc-1] = 0;
  
  // start running it
  uint64_t counter = 0;
  while (1) {
    // printf("Step %ld, PC %ld\n", counter, vm.pc);
    performStep();
    // printOp();
    counter++;
    // fprintf(stderr, "Step %ld, PC %ld, Stack ptr %ld\n", counter, vm.pc, vm.stack_ptr);
    if (counter % 1000000 == 0) printf("Step %ld, PC %ld, Stack ptr %ld\n", counter, vm.pc, vm.stack_ptr);
  }
}

