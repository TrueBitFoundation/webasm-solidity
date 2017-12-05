pragma solidity ^0.4.16;

interface Consumer {
   function consume(bytes32 id, bytes32[] dta) public;
}

/* Calculate a merkle tree in solidity */

contract Filesystem {
   bytes32[] zero;
   struct File {
     uint size;
     uint bytesize;
     bytes32[][] data;
     string name;
   }
   mapping (bytes32 => File) files;
   function Filesystem() public {
      zero.length = 20;
      zero[0] = bytes32(0);
      for (uint i = 1; i < zero.length; i++) {
         zero[i] = keccak256(zero[i-1], zero[i-1]);
      }
   }
   
   function createFileWithContents(string name, uint nonce, bytes32[] arr, uint sz) public returns (bytes32) {
      bytes32 id = createFile(name, nonce);
      setSize(id, arr.length);
      setLeafs(id, arr, 0, arr.length);
      setByteSize(id, sz);
      return id;
   }
   
   function calcId(uint nonce) public view returns (bytes32) {
         return keccak256(msg.sender, nonce);
   }

   function createFile(string name, uint nonce) public returns (bytes32) {
      bytes32 id = keccak256(msg.sender, nonce);
      File storage f = files[id];
      f.data.length = 2;
      f.data[0].length = 2;
      f.data[1].length = 1;
      f.data[0][0] = zero[0];
      f.data[0][1] = zero[0];
      f.data[1][0] = zero[1];
      f.size = 0;
      f.name = name;
      return id;
   }
   
   function expand(bytes32 id) internal {
      File storage f = files[id];
      for (uint i = 0; i < f.data.length; i++) {
         f.data[i].length = f.data[i].length*2;
      }
      f.data[f.data.length-1][1] = zero[f.data.length-1];
      f.data.length++;
      f.data[f.data.length-1].length = 1;
      f.data[f.data.length-1][0] = keccak256(f.data[f.data.length-2][0], f.data[f.data.length-2][1]);
   }
   
   function setSize(bytes32 id, uint sz) public {
      File storage f = files[id];
      while (2 ** (f.data.length-1) < sz) expand(id);
      f.size = sz;
   }
   
   function getName(bytes32 id) public view returns (string) {
      return files[id].name;
   }
   
   function getSize(bytes32 id) public view returns (uint) {
      return files[id].size;
   }

   function getByteSize(bytes32 id) public view returns (uint) {
      return files[id].bytesize;
   }

   function setByteSize(bytes32 id, uint sz) public returns (uint) {
      files[id].bytesize = sz;
   }

   function getData(bytes32 id) public view returns (bytes32[]) {
      File storage f = files[id];
      bytes32[] memory res = new bytes32[](f.size);
      for (uint i = 0; i < f.size; i++) res[i] = f.data[0][i];
      return res;
   }
   
   function forwardData(bytes32 id, address a) public {
      File storage f = files[id];
      bytes32[] memory res = new bytes32[](f.size);
      for (uint i = 0; i < f.size; i++) res[i] = f.data[0][i];
      Consumer(a).consume(id, res);
   }
   
   function getRoot(bytes32 id) public view returns (bytes32) {
      File storage f = files[id];
      return f.data[f.data.length-1][0];
   }
   function getLeaf(bytes32 id, uint loc) public view returns (bytes32) {
      File storage f = files[id];
      return f.data[0][loc];
   }
   function setLeafs(bytes32 id, bytes32[] arr, uint loc, uint len) public {
      for (uint i = 0; i < len; i++) setLeaf(id, loc+i, arr[i]);
   }
   function setLeaf(bytes32 id, uint loc, bytes32 v) public {
      File storage f = files[id];
      f.data[0][loc] = v;
      for (uint i = 1; i < f.data.length; i++) {
         loc = loc/2;
         bytes32 l1 = f.data[i-1][loc*2];
         bytes32 l2 = f.data[i-1][loc*2+1];
         if (l1 == 0) l1 = zero[i-1];
         if (l2 == 0) l2 = zero[i-1];
         f.data[i][loc] = keccak256(l1, l2);
      }
   }

   // Methods to build IO blocks
   struct Bundle {
      bytes32 name_file;
      bytes32 data_file;
      bytes32 size_file;
      uint pointer;
      address code;
      string code_file;
      bytes32 init;
      bytes32[] files;
   }

   mapping (bytes32 => Bundle) bundles;
   
   function makeSimpleBundle(uint num, address code, bytes32 code_init, bytes32 file_id) public returns (bytes32) {
       bytes32 id = keccak256(msg.sender, num);
       Bundle storage b = bundles[id];
       b.code = code;

       bytes32 res1 = bytes32(getSize(file_id));
       for (uint i = 0; i < 3; i++) res1 = keccak256(res1, zero[i]);
       
       bytes32 res2 = hashName(getName(file_id));
       for (i = 0; i < 3; i++) res2 = keccak256(res2, zero[i]);
       
       bytes32 res3 = getRoot(file_id);
       for (i = 0; i < 3; i++) res3 = keccak256(res3, zero[i]);
       
       b.init = keccak256(code_init, res1, res2, res3);

       b.files.push(file_id);

       return id;
   }

   function finalizeBundleIPFS(bytes32 id, string file, bytes32 init) public {
       Bundle storage b = bundles[id];
       bytes32[] memory res1 = new bytes32[](b.files.length);
       bytes32[] memory res2 = new bytes32[](b.files.length);
       bytes32[] memory res3 = new bytes32[](b.files.length);
       
       for (uint i = 0; i < b.files.length; i++) {
          res1[i] = bytes32(getSize(b.files[i]));
          res2[i] = hashName(getName(b.files[i]));
          res3[i] = getRoot(b.files[i]);
       }
       
       b.code_file = file;
       
       b.init = keccak256(init, calcMerkle(res1, 0, 4), calcMerkle(res2, 0, 4), calcMerkle(res3, 0, 4));
   }
   
   function makeBundle(uint num) public view returns (bytes32) {
       bytes32 id = keccak256(msg.sender, num);
       return id;
   }

   function addToBundle(bytes32 id, bytes32 file_id) public returns (bytes32) {
       Bundle storage b = bundles[id];
       b.files.push(file_id);
   }
   
   function getInitHash(bytes32 bid) public view returns (bytes32) {
       Bundle storage b = bundles[bid];
       return b.init;
   }
   
   function getCode(bytes32 bid) public view returns (bytes) {
       Bundle storage b = bundles[bid];
       return getCodeAtAddress(b.code);
   }
   
   function getFiles(bytes32 bid) public view returns (bytes32[]) {
       Bundle storage b = bundles[bid];
       return b.files;
   }
   
   function getCodeAtAddress(address a) internal view returns (bytes) {
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

   function makeMerkle(bytes arr, uint idx, uint level) internal returns (bytes32) {
      if (level == 0) return idx < arr.length ? bytes32(uint(arr[idx])) : bytes32(0);
      else return keccak256(makeMerkle(arr, idx, level-1), makeMerkle(arr, idx+(2**(level-1)), level-1));
   }

   function calcMerkle(bytes32[] arr, uint idx, uint level) internal returns (bytes32) {
      if (level == 0) return idx < arr.length ? arr[idx] : bytes32(0);
      else return keccak256(calcMerkle(arr, idx, level-1), calcMerkle(arr, idx+(2**(level-1)), level-1));
   }

   // assume 256 bytes?
   function hashName(string name) public returns (bytes32) {
      return makeMerkle(bytes(name), 0, 8);
   }

   /*
   function addToBundle(bytes32 bid, bytes32 id) public {
       Bundle storage b = bundles[bid];
       setLeaf(b.data_file, b.pointer, getRoot(uint(id)));
       setLeaf(b.size_file, b.pointer, bytes32(getSize(uint(id))));
       setLeaf(b.name_file, b.pointer, hashName(getName(uint(id))));
       b.pointer++;
   }

   function makeBundle(uint num, address code, uint sz) public returns (bytes32) {
       bytes32 id = keccak256(msg.sender, num);
       Bundle storage b = bundles[id];
       b.name_file = createFile("names", uint(id));
       b.data_file = createFile("data", uint(id)+1);
       b.size_file = createFile("size", uint(id)+2);
       b.code = code;
       setSize(b.name_file, sz);
       setSize(b.data_file, sz);
       setSize(b.size_file, sz);
       
       return id;
   }
   */
   
}

