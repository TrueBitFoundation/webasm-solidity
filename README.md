[![Build Status](https://travis-ci.org/TrueBitFoundation/webasm-solidity.svg?branch=master)](https://travis-ci.org/TrueBitFoundation/webasm-solidity)

# On-chain interpreter

## Testing on-chain interpreter

You can download a Docker image and run the tests inside of a container:

```
docker run --name wasm-solidity-test -ti hswick/wasm-solidity:latest
cd webasm-solidity
sh runtests.sh
```

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
testrpc -d test
```

Change the line
```
var test = JSON.parse(fs.readFileSync("load.json"))
```
to test another proof.

Comment and uncomment the lines in the end of `test.js` to select which phase is tested.

Running the test:
```
npm install
node test.js
```
If the test doesn't output an error, it should have passed. If the proof was wrong, then it will complain about invalid EVM opcode (this is how reverting the state is currently handled in the EVM).

## Simple test node

Install Parity, then run it with
```
echo > passfile
parity --chain dev --unlock=0x00a329c0648769a73afac7f9381e08fb43dbea72 --reseal-min-period 0 --password passfile
```
If Parity complains about password or missing account, try
```
parity --chain dev --unlock=0x00a329c0648769a73afac7f9381e08fb43dbea72
```
and then exit Parity. Now it should have created the development account.

Run the test node:
```
npm install
node deploy-tasks.js > config.json
node app.js
```

For user interface, `app.html` and `socketio.js` have to be on a web server in the same machine as the test node is running.
