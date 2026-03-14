// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Pinbo} from "../src/Pinbo.sol";

contract Deploy is Script {
    function run() public {
        vm.startBroadcast();

        Pinbo pinbo = new Pinbo();

        vm.stopBroadcast();

        console.log("Pinbo deployed at:", address(pinbo));
    }
}