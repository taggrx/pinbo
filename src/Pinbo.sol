// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Pinbo {
    event MessagePosted(address indexed sender, bytes message, uint256 timestamp);

    uint256 public latestMessageBlock;

    function postMessage(bytes memory message) public {
        require(message.length > 0, "Message cannot be empty");
        latestMessageBlock = block.number;
        emit MessagePosted(msg.sender, message, block.timestamp);
    }
}
