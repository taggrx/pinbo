// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Pinbo} from "../src/Pinbo.sol";

contract PinboTest is Test {
    Pinbo public pinbo;

    receive() external payable {}

    function setUp() public {
        pinbo = new Pinbo();
        vm.deal(address(this), 1 ether);
    }

    function test_PostMessageEmitsEvent() public {
        bytes memory message = "Hello, world!";
        uint256 feeAmount = pinbo.fee();
        vm.expectEmit(true, false, false, true);
        emit MessagePosted(address(this), message, block.timestamp);
        pinbo.postMessage{value: feeAmount}(message);
    }

    function test_PostMessageUpdatesLatestBlock() public {
        uint256 initialBlock = pinbo.latestMessageBlock();
        bytes memory message = "Update block";
        uint256 feeAmount = pinbo.fee();
        pinbo.postMessage{value: feeAmount}(message);
        uint256 newBlock = pinbo.latestMessageBlock();
        assertEq(newBlock, block.number);
        assertGt(newBlock, initialBlock);
    }

    function test_PostMessageEmptyString() public {
        uint256 feeAmount = pinbo.fee();
        vm.expectRevert("Message cannot be empty");
        pinbo.postMessage{value: feeAmount}("");
    }



    function test_PostMessageGasUsage() public {
        bytes memory shortMessage = "Short";
        uint256 feeAmount = pinbo.fee();
        uint256 gasStart = gasleft();
        pinbo.postMessage{value: feeAmount}(shortMessage);
        uint256 gasUsed = gasStart - gasleft();

        // Log gas usage for reference
        console.log("Gas used for short message:", gasUsed);

        // Ensure gas usage is reasonable (less than 100k for events)
        assertLt(gasUsed, 100000);
    }

    function test_PostMessageLongString() public {
        // Create a long bytes (500 bytes)
        bytes memory longMessage = new bytes(500);
        uint256 feeAmount = pinbo.fee();
        for (uint256 i = 0; i < longMessage.length; i++) {
            longMessage[i] = bytes1("a");
        }

        uint256 gasStart = gasleft();
        pinbo.postMessage{value: feeAmount}(longMessage);
        uint256 gasUsed = gasStart - gasleft();

        console.log("Gas used for 500-byte message:", gasUsed);
        // Long bytes cost more gas but should still succeed
        assertLt(gasUsed, 500000);
    }

    function testFuzz_PostMessage(bytes memory message) public {
        // Skip empty bytes in fuzzing
        vm.assume(message.length > 0);

        uint256 feeAmount = pinbo.fee();
        vm.expectEmit(true, false, false, true);
        emit MessagePosted(address(this), message, block.timestamp);
        pinbo.postMessage{value: feeAmount}(message);
    }

    function test_InitialLatestMessageBlockIsZero() public {
        assertEq(pinbo.latestMessageBlock(), 0);
    }
}

// Helper event definition for vm.expectEmit
event MessagePosted(address indexed sender, bytes message, uint256 timestamp);
