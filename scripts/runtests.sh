#!/bin/sh

testrpc -d test -l 7000000 &

sleep 10

cd node

for i in ../tests/*.json; do node test.js $i || exit 1; done


