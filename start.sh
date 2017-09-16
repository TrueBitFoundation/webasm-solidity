#!/bin/sh

service apache2 restart

echo > passfile
parity --chain dev --unlock=0x00a329c0648769a73afac7f9381e08fb43dbea72 --reseal-min-period 0 --password passfile &
ipfs daemon &

sleep 5
node deploy-tasks.js > config.json
node app.js

