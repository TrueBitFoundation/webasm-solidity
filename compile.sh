#!/bin/sh

# ./wasm -step 10 -m ../test/core/fac.wast | head -n 17 > test.json

mkdir -p contracts

sed 's/REPLACEME/CommonOffchain is Offchain/g' common.sol > common-offchain.sol
sed 's/REPLACEME/CommonOnchain is Onchain/g' common.sol > common-onchain.sol

solc --abi --optimize --overwrite --bin -o contracts getcode.sol
solc --abi --optimize --overwrite --bin -o contracts instruction.sol
solc --abi --optimize --overwrite --bin -o contracts tasks.sol
solc --abi --optimize --overwrite --bin -o contracts interactive2.sol
solc --abi --optimize --overwrite --bin -o contracts interpreter.sol
solc --abi --optimize --overwrite --bin -o contracts judge.sol
solc --abi --optimize --overwrite --bin -o contracts testUser.sol


