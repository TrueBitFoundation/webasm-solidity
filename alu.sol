pragma solidity ^0.4.15;

library ALU {
    function handleALU(uint hint, uint r1, uint r2, uint r3) returns (uint) {
        uint res;
        if (hint == 0) return 0;
        else if (hint == 1) revert(); // Trap
        else if (hint == 2) {
            if (r1 < r2) res = r1;
            else res = r2;
        }
        else if (hint == 3) {
            if (r1 == 0) res = r2;
            else res = r3;
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
            if (r1 == r2) res = 1;
            else res = 0;
        }
        else if (hint == 0x48) {
            if (int32(r1) < int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x49) {
            if (uint32(r1) < uint32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4a) {
            if (int32(r1) > int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4b) {
            if (uint32(r1) > uint32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4c) {
            if (int32(r1) <= int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4d) {
            if (uint32(r1) <= uint32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4e) {
            if (int32(r1) >= int32(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x4f) {
            if (uint32(r1) >= uint32(r2)) res = 0;
            else res = 1;
        }

        else if (hint == 0x53) {
            if (int64(r1) < int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x54) {
            if (uint64(r1) < uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x55) {
            if (int64(r1) > int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x56) {
            if (uint64(r1) > uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x57) {
            if (int64(r1) <= int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x58) {
            if (uint64(r1) <= uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x59) {
            if (int64(r1) >= int64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x5a) {
            if (uint64(r1) >= uint64(r2)) res = 0;
            else res = 1;
        }
        else if (hint == 0x67) {
            // clz: count leading zeros 32
        }
        else if (hint == 0x68) {
            // ctz: count trailing zeros 32
        }
        else if (hint == 0x69) {
            // popcnt: count ones 32
        }
        else if (hint == 0x79) {
            // clz: count leading zeros 64
        }
        else if (hint == 0x7a) {
            // ctz: count trailing zeros 64
        }
        else if (hint == 0x7b) {
            // popcnt: count ones 64
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
            res = uint(int32(r1)/int32(r2));
        }
        else if (hint == 0x7f) {
            res = uint(int64(r1)/int64(r2));
        }
        else if (hint == 0x6e || hint == 0x80) {
            res = r1/r2;
        }
        else if (hint == 0x6f) {
            res = uint(int32(r1)%int32(r2));
        }
        else if (hint == 0x81) {
            res = uint(int64(r1)%int64(r2));
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
            res = r1*2**r2; // shift 
        }
        else if (hint == 0x75 || hint == 0x87) {
            res = r1/2**r2;
        }
        else if (hint == 0x76 || hint == 0x88) {
            res = r1/2**r2;
        }
        // rol, ror
        else if (hint == 0x77) {
            res = (r1*2**r2) | (r1/2**32);
        }
        else if (hint == 0x78) {
            res = (r1/2**r2) | (r1*2**32);
        }
        else if (hint == 0x89) {
            res = (r1*2**r2) | (r1/2**64);
        }
        else if (hint == 0x8a) {
            res = (r1/2**r2) | (r1*2**64);
        }
        
        if (hint >= 0x62 && hint <= 0x78) {
            res = res % (2**32);
        }
        else if (hint >= 0x7c && hint <= 0x8a) {
            res = res % (2**64);
        }
        
        return res;
    }
    
}