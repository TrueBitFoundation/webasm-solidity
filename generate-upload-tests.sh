#!/bin/bash

mkdir -p upload_tests
rm upload_tests/*.bin

( for i in {1..1024}; do echo -n "ff"; done ) > upload_tests/test1k.bin 
( for i in {1..2048}; do echo -n "ff"; done ) > upload_tests/test2k.bin 
( for i in {1..4096}; do echo -n "ff"; done ) > upload_tests/test4k.bin 
( for i in {1..10240}; do echo -n "ff"; done ) > upload_tests/test10k.bin 
( for i in {1..20480}; do echo -n "ff"; done ) > upload_tests/test20k.bin 
( for i in {1..40960}; do echo -n "ff"; done ) > upload_tests/test40k.bin 

