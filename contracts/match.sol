
pragma solidity ^0.4.19;

// how to match people who disagree against each other

contract Match {
   
   address[] agree;
   bytes32 current;
   
   mapping (address => bytes32) vote;
   
   struct Game {
      address fst;
      address snd;
      uint status;
   }
   
   Game[] opponents;

   // Add to the pool of people who agree
   function addAgree(bytes32 cur) public {
      require(cur == current || agree.length == 0);
      vote[msg.sender] = current;
      if (current != cur) current = cur;
      agree.push(msg.sender);
   }
   
   event StartGame(address a, address b);

   function addDisagree(bytes32 v) public {
      require(current != v && agree.length != 0);
      vote[msg.sender] = current;
      address a = agree[agree.length-1];
      agree.length--;
      opponents.push(Game(msg.sender, a, 0));
      StartGame(msg.sender, a);
   }

}

contract Challenger {
    mapping (address => bool) challengers;
    
    
}


