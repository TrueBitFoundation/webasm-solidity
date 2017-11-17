#!/bin/sh

if [ ! -f supersecret.txt ]
then
  echo "" > supersecret.txt
  parity --chain dev &
  sleep 10
  killall parity
  sleep 10
fi

service apache2 restart

ipfs daemon &
parity --chain dev --unlock=0x00a329c0648769a73afac7f9381e08fb43dbea72 --no-discovery --reseal-min-period 0 --password=supersecret.txt --ws-hosts=all --ws-origins=all &

sleep 10

cd webasm-solidity/node
node deploy-tasks.js > config.json
node app.js

