pragma solidity ^0.4.16;

interface Consumer {
   function consume(uint id, bytes32[] dta) public;
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
   mapping (uint => File) files;
   function Filesystem() public {
      zero.length = 32;
      zero[0] = bytes32(0);
      for (uint i = 1; i < 32; i++) {
         zero[i] = keccak256(zero[i-1], zero[i-1]);
      }
   }
   
   function createFileWithContents(string name, uint nonce, bytes32[] arr, uint sz) public returns (uint) {
      uint id = createFile(name, nonce);
      setSize(id, arr.length);
      setLeafs(id, arr, 0, arr.length);
      setByteSize(id, sz);
      return id;
   }
   
   function calcId(uint nonce) public view returns (uint) {
         return uint(keccak256(msg.sender, nonce));
   }

   function createFile(string name, uint nonce) public returns (uint) {
      uint id = uint(keccak256(msg.sender, nonce));
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
   
   function expand(uint id) internal {
      File storage f = files[id];
      for (uint i = 0; i < f.data.length; i++) {
         f.data[i].length = f.data[i].length*2;
      }
      f.data[f.data.length-1][1] = zero[f.data.length-1];
      f.data.length++;
      f.data[f.data.length-1].length = 1;
      f.data[f.data.length-1][0] = keccak256(f.data[f.data.length-2][0], f.data[f.data.length-2][1]);
   }
   
   function setSize(uint id, uint sz) public {
      File storage f = files[id];
      while (2 ** (f.data.length-1) < sz) expand(id);
      f.size = sz;
   }
   
   function getName(uint id) public view returns (string) {
      return files[id].name;
   }
   
   function getSize(uint id) public view returns (uint) {
      return files[id].size;
   }

   function getByteSize(uint id) public view returns (uint) {
      return files[id].bytesize;
   }

   function setByteSize(uint id, uint sz) public returns (uint) {
      files[id].bytesize = sz;
   }

   function getData(uint id) public view returns (bytes32[]) {
      File storage f = files[id];
      bytes32[] memory res = new bytes32[](f.size);
      for (uint i = 0; i < f.size; i++) res[i] = f.data[0][i];
      return res;
   }
   
   function forwardData(uint id, address a) public {
      File storage f = files[id];
      bytes32[] memory res = new bytes32[](f.size);
      for (uint i = 0; i < f.size; i++) res[i] = f.data[0][i];
      Consumer(a).consume(id, res);
   }
   
   function getRoot(uint id) public view returns (bytes32) {
      File storage f = files[id];
      return f.data[f.data.length-1][0];
   }
   function getLeaf(uint id, uint loc) public view returns (bytes32) {
      File storage f = files[id];
      return f.data[0][loc];
   }
   function setLeafs(uint id, bytes32[] arr, uint loc, uint len) public {
      for (uint i = 0; i < len; i++) setLeaf(id, loc+i, arr[i]);
   }
   function setLeaf(uint id, uint loc, bytes32 v) public {
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
      uint name_file;
      uint data_file;
      uint size_file;
      uint pointer;
   }

   mapping (bytes32 => Bundle) bundles;

   function makeBundle(uint num, uint sz) public returns (bytes32) {
       bytes32 id = keccak256(msg.sender, num);
       Bundle storage b = bundles[id];
       b.name_file = createFile("names", uint(id));
       b.data_file = createFile("data", uint(id)+1);
       b.size_file = createFile("size", uint(id)+2);
       setSize(b.name_file, sz);
       setSize(b.data_file, sz);
       setSize(b.size_file, sz);
       
       return id;
   }
   
   function makeMerkle(bytes arr, uint idx, uint level) internal returns (bytes32) {
      if (level == 0) return idx < arr.length ? bytes32(arr[idx]) : bytes32(0);
      else return keccak256(makeMerkle(arr, idx, level-1), makeMerkle(arr, idx+(2**level), level-1));
   }
   
   // assume 256 bytes?
   function hashName(string name) internal returns (bytes32) {
      return makeMerkle(bytes(name), 0, 8);
   }

   function addToBundle(bytes32 bid, bytes32 id) public {
       Bundle storage b = bundles[bid];
       setLeaf(b.data_file, b.pointer, getRoot(uint(id)));
       setLeaf(b.size_file, b.pointer, bytes32(getSize(uint(id))));
       setLeaf(b.name_file, b.pointer, hashName(getName(uint(id))));
       b.pointer++;
   }

}

