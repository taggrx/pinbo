// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Pinboard {
    event MessagePosted(address indexed sender, string message, uint256 timestamp);

    function postMessage(string memory message) public {
        require(bytes(message).length > 0, "Message cannot be empty");
        emit MessagePosted(msg.sender, message, block.timestamp);
    }
}