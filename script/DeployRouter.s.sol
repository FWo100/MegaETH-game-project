// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/console2.sol";
import {Script} from "forge-std/Script.sol";
import "../contracts/ClickBatchRouter.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployRouter is Script {
    Vm vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    
    function run() external {
        address gameAddress = 0x1BfA257B22F81614D5edBc8700724685E7F8f0E5;

        vm.startBroadcast();

        ClickBatchRouter router = new ClickBatchRouter(gameAddress);
        console2.log("New ClickBatchRouter deployed at:");
        console2.log(address(router));

        vm.stopBroadcast();
    }
}
