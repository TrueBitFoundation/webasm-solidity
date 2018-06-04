#!/bin/sh
for i in test/vm-tests/*.json; do node test/judge.js $i || exit 1; done