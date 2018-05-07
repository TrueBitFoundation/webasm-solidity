#!/bin/sh

function tgen() {
  ~/ocaml-offchain/interpreter/wasm -m -wasm globals.wasm -table-size 20 -stack-size 20 -memory-size 20 -file input.data -file output.data -step $1 | tee test_$1.json
}

