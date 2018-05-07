[![Build Status](https://travis-ci.org/TrueBitFoundation/webasm-solidity.svg?branch=master)](https://travis-ci.org/TrueBitFoundation/webasm-solidity)

# On-chain interpreter

<p align="center">
  <img src="./Dispute Resolution Layer.jpg"/>
</p>

This project contains the code for the WASM onchain dispute resolution.

## Usage

Install necessary dependencies:
```
npm install
```

Ensure you have a development blockchain you can use. For example:
```
npm install -g ganache-cli

ganache-cli
```

Or you can use `parity`:

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

Then you need to compile the smart contracts. You will need `solc` already installed on your machine.

```
chmod 755 ./scripts/compile.sh
npm run compile
```

Then you can test the on chain wasm interpreter smart contract with precompiled wasm code

```
chmod 755 ./scripts/runtests.sh
npm run test
```

If the test doesn't output an error, it should have passed. If the proof was wrong, then it will complain about invalid EVM opcode (this is how reverting the state is currently handled in the EVM).

## Example Application

If you want to see the code in the context of an example application follow these instructions. This application uses ipfs so you'll have to make sure you install it. In a separate directory follow these installation instructions:

```
wget https://dist.ipfs.io/go-ipfs/v0.4.10/go-ipfs_v0.4.10_linux-amd64.tar.gz
tar xf go-ipfs_v0.4.10_linux-amd64.tar.gz
cd go-ipfs
./install.sh
ipfs init
```

And then the daemon can be started with:
```
ipfs daemon
```

Run the test node:
```
cd node/
node deploy-tasks.js > config.json
node app.js
```

For user interface, `app.html` and `socketio.js` have to be on a web server in the same machine as the test node is running.