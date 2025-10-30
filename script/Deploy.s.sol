// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/console2.sol";
import {Script} from "forge-std/Script.sol";
import "../contracts/FluffleTestGame.sol";
import "../contracts/SessionManager.sol";
import "../contracts/ClickBatchRouter.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract Deploy is Script {
    Vm vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    function run() external {
        vm.startBroadcast();

        FluffleTestGame game = new FluffleTestGame(tx.origin);
        SessionManager mgr = new SessionManager(address(game), tx.origin);
        console2.log("FluffleTestGame");
        console2.log(address(game));
        console2.log("SessionManager");
        console2.log(address(mgr));

        address target = address(game);
        ClickBatchRouter router = new ClickBatchRouter(target);
        console2.log("ClickBatchRouter");
        console2.log(address(router));

        console2.log("NOTE: Run this manually to authorize the router:");
        console2.log("cast send");
        console2.log(address(game));
        console2.log("'authorizeContract(address)'");
        console2.log(address(router));
        console2.log("--private-key <YOUR_PRIVATE_KEY>");
        console2.log("Or use the game owner account in a wallet to call authorizeContract(routerAddress)");

        vm.stopBroadcast();
    }
}
