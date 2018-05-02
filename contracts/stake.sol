pragma solidity ^0.4.16;

import "./DepositsManager.sol";

contract Stake is DepositsManager {
    
    struct Ticket {
        bytes32 hash;
        uint bnum;
    }

    mapping (address => Ticket) tickets;
    mapping (bytes32 => bool) ticket_used;
    
    // Price of stake
    uint constant PRICE = 1 ether;
    uint constant JACKPOT = 100 ether;

    // Timeout
    uint constant TIMEOUT = 20;
    
    uint JACKPOT_LIMIT = uint(uint(2**255) / uint(10000) * 2);
    
    // If answers after this, will have punishment for being late
    uint constant LATE = 10;
    
    uint constant LATE_FEE = 0.1 ether;
    
    uint constant DEPOSIT = 1 ether;

    struct Task {
        uint bnum;
        bytes32 init;
        uint multiplier;
        
        uint bnum2;
        address solver;
        bytes32 commit_solution;
        
        bytes32 solution;
        address[] check;
        mapping (address => bool) checked;
    }

    Task[] tasks;

    function buyTicket(bytes32 ticket) public {
        subDeposit(msg.sender, PRICE);
        require(!ticket_used[ticket]);
        ticket_used[ticket] = true;
        tickets[msg.sender].hash = ticket;
        tickets[msg.sender].bnum = block.number;
    }
    
    function removeTicket(address a) internal {
        tickets[a].hash = bytes32(0);
    }

    function post(bytes32 init, uint mult) public {
        uint id = tasks.length;
        tasks.length++;
        Task storage t = tasks[id];
        t.init = init;
        t.multiplier = mult;
        t.bnum = block.number;
    }

    function taskInitRandom(uint tnum, address solver) internal view returns (uint) {
        Task storage t = tasks[tnum];
        bytes32 thash = keccak256(solver, t.init, block.blockhash(t.bnum));
        return uint(thash);
    }

    function taskSolveRandom(uint tnum, bytes32 solution, address solver) internal view returns (uint) {
        Task storage t = tasks[tnum];
        bytes32 thash = keccak256(solver, solution, block.blockhash(t.bnum2));
        return uint(thash)/t.multiplier/specialMultiplier(tnum, solver);
    }
    
    function specialMultiplier(uint tnum, address solver) internal view returns (uint) {
        Task storage t = tasks[tnum];
        bytes32 thash = keccak256(solver, t.init, block.blockhash(t.bnum));
        return (uint(thash) % 20) + 1;
    }

    // should have deposit here
    function solve(uint tnum, bytes32 sol_hash) public {
        subDeposit(msg.sender, DEPOSIT);
        require(tickets[msg.sender].hash != 0);
        Task storage t = tasks[tnum];
        if (t.solver != 0) {
            require(taskInitRandom(tnum, msg.sender) < taskInitRandom(tnum, t.solver));
            if (block.number > t.bnum + LATE) transferDeposit(msg.sender, t.solver, LATE_FEE);
        }
        t.solver = msg.sender;
        t.commit_solution = sol_hash; // the solution is secret for now
        t.bnum2 = block.number;
    }
    
    // 
    function finalize(uint tnum, bytes32 solution) public {
        Task storage t = tasks[tnum];
        require(keccak256(solution) == t.commit_solution);
        require(t.solver == msg.sender);
        require(block.number > t.bnum2 + TIMEOUT);
        t.solution = solution;
        addDeposit(msg.sender, DEPOSIT);
    }
    
    function checkJackpot(uint tnum) public returns (uint) {
        subDeposit(msg.sender, DEPOSIT);
        Task storage t = tasks[tnum];
        require(tickets[msg.sender].hash != 0);
        t.check.push(msg.sender);
        t.checked[msg.sender] = true;
        return t.check.length - 1;
    }

    function claimJackpot(uint tnum, uint idx, bytes32 solution) public {
        Task storage t = tasks[tnum];
        require(t.check[idx] == msg.sender);
        require(keccak256(solution) == t.commit_solution && block.number > t.bnum2 + TIMEOUT);
        if (taskSolveRandom(tnum, solution, msg.sender) < JACKPOT_LIMIT) {
           addDeposit(msg.sender, JACKPOT);
        }
        addDeposit(msg.sender, DEPOSIT);
    }

    function stealJackpot(uint tnum, bytes32 solution, address victim) public {
        Task storage t = tasks[tnum];
        require(t.checked[victim] == false);
        require(keccak256(solution) == t.commit_solution && block.number > t.bnum2 + TIMEOUT);
        if (taskSolveRandom(tnum, solution, victim) < JACKPOT_LIMIT) {
           addDeposit(msg.sender, JACKPOT);
        }
    }

}

