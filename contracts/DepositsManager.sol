pragma solidity ^0.4.4;

contract DepositsManager {

    mapping(address => uint) public deposits;

    event DepositMade(address who, uint amount);
    event DepositWithdrawn(address who, uint amount);

    // @dev – the constructor
    function DepositsManager() public {
    }
    
    // @dev – returns an account's deposit
    // @param who – the account's address.
    // @return – the account's deposit.
    function getDeposit(address who) constant public returns (uint) {
        return deposits[who];
    }

    // @dev – allows a user to deposit eth.
    // @return – the user's updated deposit amount.
    function makeDeposit() public payable returns (uint) {
        deposits[msg.sender] += msg.value;
        DepositMade(msg.sender, msg.value);
        return deposits[msg.sender];
    }

    // @dev – allows a user to withdraw eth from their deposit.
    // @param amount – how much eth to withdraw
    // @return – the user's updated deposit amount.
    function withdrawDeposit(uint amount) public returns (uint) {
        require(deposits[msg.sender] > amount);

        deposits[msg.sender] -= amount;
        msg.sender.transfer(amount);

        DepositWithdrawn(msg.sender, amount);
        return deposits[msg.sender];
    }

}