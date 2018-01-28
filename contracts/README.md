
Here is a short description of up-to-date files
 * tasks.sol: contract for posting tasks
  * fs.sol: file system, this is needed for constructing the input and
output for the tasks
 * interactive2.sol: interactive proofs, this is called from tasks.sol
in case of dispute
* vmmemory.sol: some helpers for handling the memory, inherited in
alu.sol
* alu.sol: handling arithmetic and other computations
* onchain.sol: handling merkle proofs
* offchain: same as onchain.sol, but can be used for off-chain
computation of the VM, just linear memory instead of merkle proofs
* common.sol: handling the computation steps. each instruction is
executed in several places
* judge.sol: entry point for validating a computation step, called by
interactive2.sol when the binary search has found the correct
position. judge method is the main entry point for validating a single
step

