#!/bin/sh

service apache2 restart

parity --chain kovan --unlock=`cat /myaddress` --password /supersecret.txt --ws-hosts=all --ws-origins=all &
ipfs daemon &

node setup.js
node app.js

