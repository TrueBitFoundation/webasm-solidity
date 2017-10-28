#!/bin/sh

if [ ! -f myaddress ]
then
  echo plort > supersecret.txt
  geth --rinkeby account new --password supersecret.txt
fi

service apache2 restart

geth --rinkeby --unlock 0 --password=supersecret.txt --ws --wsaddr 0.0.0.0 -wsapi eth --wsorigins="*" &
ipfs daemon &

node setup.js rinkeby.json > config.json
node app.js

