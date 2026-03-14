// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Pinboard} from "../src/Pinboard.sol";

contract PinboardTest is Test {
    Pinboard public pinboard;

    function setUp() public {
        pinboard = new Pinboard();
    }

    function test_PostMessageEmitsEvent() public {
        string memory message = "Hello, world!";
        vm.expectEmit(true, false, false, true);
        emit MessagePosted(address(this), message, block.timestamp);
        pinboard.postMessage(message);
    }

    function test_PostMessageEmptyString() public {
        vm.expectRevert("Message cannot be empty");
        pinboard.postMessage("");
    }

    function test_PostMessageGasUsage() public {
        string memory shortMessage = "Short";
        uint256 gasStart = gasleft();
        pinboard.postMessage(shortMessage);
        uint256 gasUsed = gasStart - gasleft();
        
        // Log gas usage for reference
        console.log("Gas used for short message:", gasUsed);

        // Ensure gas usage is reasonable (less than 100k for events)
        assertLt(gasUsed, 100000);
    }

    function test_PostMessageLongString() public {
        // Create a long string (500 bytes)
        string memory longMessage = new string(500);
        bytes memory b = bytes(longMessage);
        for (uint256 i = 0; i < b.length; i++) {
            b[i] = bytes1("a");
        }

        uint256 gasStart = gasleft();
        pinboard.postMessage(longMessage);
        uint256 gasUsed = gasStart - gasleft();
        
        console.log("Gas used for 500-byte message:", gasUsed);
        // Long strings cost more gas but should still succeed
        assertLt(gasUsed, 500000);
    }

    function testFuzz_PostMessage(string memory message) public {
        // Skip empty strings in fuzzing
        vm.assume(bytes(message).length > 0);
        
        vm.expectEmit(true, false, false, true);
        emit MessagePosted(address(this), message, block.timestamp);
        pinboard.postMessage(message);
    }
}

// Helper event definition for vm.expectEmit
event MessagePosted(address indexed sender, string message, uint256 timestamp);