#!/bin/sh

testrpc -d test &

sleep 10

for i in tests/*.json; do node test.js $i || exit 1; done