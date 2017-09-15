# On-chain interpreter

## Testing on-chain interpreter

Install the test server. Testrpc seems to require a recent version of Node.js:
```
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g ethereumjs-testrpc
```

Install Solidity compiler from https://github.com/ethereum/solidity/releases

Compiling `instruction.sol` to EVM bytecodes:
```
cd solidity
sh ./test.sh
```

Starting up the test server:
```
testrpc
```

Copy one of the generated addresses, and this line in modify `test.js`
```
var base = "0xb29e66c60114e5ddc9a60e61e38e6b60a7448c25"
```
so that it has one of the generated addresses.

Change the line
```
var test = JSON.parse(fs.readFileSync("load.json"))
```
to test another proof.

Comment and uncomment the lines in the end of `test.js` to select which phase is tested.

Running the test:
```
npm install web3
node test.js
```
If the test doesn't output an error, it should have passed. If the proof was wrong, then it will complain about invalid EVM opcode (this is how reverting the state is currently handled in the EVM).

## Simple test node

Install Parity, then run it with
```
echo > passfile
parity --chain dev --unlock=0x00a329c0648769a73afac7f9381e08fb43dbea72 --reseal-min-period 0 --password passfile
```

Run the test node:
```
npm install
node app.js
```
