// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Pinboard} from "../src/Pinboard.sol";

contract Deploy is Script {
    function run() public {
        vm.startBroadcast();

        Pinboard pinboard = new Pinboard();

        vm.stopBroadcast();

        console.log("Pinboard deployed at:", address(pinboard));
    }
}