#!/bin/sh

testrpc -d test &

sleep 1
node app.js

