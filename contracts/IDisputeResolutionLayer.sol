pragma solidity ^0.4.18;

contract IDisputeResolutionLayer {
    enum Status { Uninitialized, Challenged, Unresolved, SolverWon, ChallengerWon }
    function status(bytes32 gameId) external view returns (Status);
}

