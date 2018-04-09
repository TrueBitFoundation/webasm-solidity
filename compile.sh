#!/bin/sh

# ./wasm -step 10 -m ../test/core/fac.wast | head -n 17 > test.json

cd contracts

mkdir -p compiled

sed 's/REPLACEME/CommonOffchain is Offchain/g' common.sol > common-offchain.sol
sed 's/REPLACEME/CommonOnchain is Onchain/g' common.sol > common-onchain.sol

solc --abi --optimize --overwrite --bin -o compiled fs.sol
solc --abi --optimize --overwrite --bin -o compiled getcode.sol
solc --abi --optimize --overwrite --bin -o compiled tasks.sol
solc --abi --optimize --overwrite --bin -o compiled resubmit.sol
solc --abi --optimize --overwrite --bin -o compiled interactive.sol
solc --abi --optimize --overwrite --bin -o compiled interpreter.sol
solc --abi --optimize --overwrite --bin -o compiled judge.sol
# solc --abi --optimize --overwrite --bin -o compiled testUser.sol
# solc --abi --optimize --overwrite --bin -o compiled parallel.sol
solc --abi --optimize --overwrite --bin -o compiled merkle.sol

