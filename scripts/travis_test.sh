#!/bin/sh

ganache-cli -l 7000000 &

sleep 10

for i in test/vm-tests/*.json; do node test/judge.js $i || exit 1; done

#npm run deploy
#npm run test test/task-lifecycle.js
