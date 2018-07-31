pragma solidity ^0.4.16;

interface IGameMaker {
    function make(uint taskID, address solver, address verifier, bytes32 startStateHash, bytes32 endStateHash, uint256 size, uint timeout) external returns (bytes32);
}
