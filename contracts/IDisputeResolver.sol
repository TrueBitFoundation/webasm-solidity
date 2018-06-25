pragma solidity ^0.4.18;

contract IDisputeResolver {
    enum Status { NONE, UNRESOLVED, SOLVER_WINS, VERIFIER_WINS }
    function status(bytes32 gameId) public view returns (Status);
    function newGame(address solver, address verifier, bytes32 spec, uint when) public returns (bytes32 gameId);
}

