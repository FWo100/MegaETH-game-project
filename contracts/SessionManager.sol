// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IFluffle {
    function registerSession(address session) external;
}

contract SessionManager is Ownable {
    IFluffle public game;

    constructor(address gameAddr, address initialOwner) Ownable(initialOwner) {
        require(gameAddr != address(0), "game=0");
        game = IFluffle(gameAddr);
    }

    function setGame(address gameAddr) external onlyOwner {
        require(gameAddr != address(0), "game=0");
        game = IFluffle(gameAddr);
    }

    function setupAndFund(address sessionEOA) external payable {
        require(sessionEOA != address(0), "session=0");
        // Register session where msg.sender is the owner inside the game
        game.registerSession(sessionEOA);
        // Forward entire deposit to the session
        (bool ok, ) = payable(sessionEOA).call{value: msg.value}("");
        require(ok, "funding failed");
    }
}
