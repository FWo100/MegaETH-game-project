// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/console2.sol";
import {Script} from "forge-std/Script.sol";
import "../contracts/FluffleTestGame.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract AuthorizeRouter is Script {
    Vm vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    
    function run() external {
        // Read addresses from frontend .env
        address gameAddress = 0x1BfA257B22F81614D5edBc8700724685E7F8f0E5; // VITE_GAME_ADDRESS
        address routerAddress = 0x9ac8f1b7C6598d774f617804941c22E1732466b6; // VITE_ROUTER_ADDRESS

        vm.startBroadcast();

        FluffleTestGame game = FluffleTestGame(gameAddress);
        
        console2.log("Authorizing router:", routerAddress);
        console2.log("In game contract:", gameAddress);
        
        game.authorizeContract(routerAddress);
        
        console2.log("Router authorized successfully!");

        vm.stopBroadcast();
    }
}
