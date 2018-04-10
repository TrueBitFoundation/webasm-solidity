#!/bin/sh

echo plort > supersecret.txt
mkdir -p ~/.local/share/io.parity.ethereum/chains/kovan/
if [ ! -f ~/.local/share/io.parity.ethereum/chains/kovan/myaddress ]
then
  parity --chain kovan account new --password=supersecret.txt > ~/.local/share/io.parity.ethereum/chains/kovan/myaddress
fi

service apache2 restart

parity --chain kovan --unlock=`cat ~/.local/share/io.parity.ethereum/chains/kovan/myaddress` --password=supersecret.txt --ws-hosts=all --ws-origins=all &
ipfs daemon &
sleep 10

cd webasm-solidity/node
node setup.js kovan.json > config.json
node app.js

