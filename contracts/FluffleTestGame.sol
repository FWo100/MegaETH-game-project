// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract FluffleTestGame is Ownable, ReentrancyGuard {
    mapping(address => address) public ownerToSession;
    mapping(address => address) public sessionToOwner;
    mapping(address => bool) public authorizedContracts; // Contracts authorized to call flap()

    uint16 public feeMultiplierBps = 10000; // 1.00x of reported gas
    uint16 public feeToleranceBps = 1000;   // 10% under-estimate tolerance

    event SessionRegistered(address indexed owner, address indexed session);
    event MovePaid(address indexed owner, address indexed session, uint256 reportedGasWei, uint256 extraPaidWei);
    event Withdrawn(address indexed to, uint256 amount);

    error NotSession();
    error Underpay();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerSession(address session) external {
        require(session != address(0), "session=0");
        // msg.sender is the owner wallet
        address prev = ownerToSession[msg.sender];
        if (prev != address(0)) {
            // cleanup reverse mapping
            sessionToOwner[prev] = address(0);
        }
        ownerToSession[msg.sender] = session;
        sessionToOwner[session] = msg.sender;
        emit SessionRegistered(msg.sender, session);
    }

    function flap(uint256 reportedGasWei) external payable {
        address ownerAddr = sessionToOwner[msg.sender];
        // Allow authorized contracts (like the router) to call flap
        if (ownerAddr == address(0) && !authorizedContracts[msg.sender]) revert NotSession();

        uint256 due = (reportedGasWei * (10000 + feeMultiplierBps)) / 10000;
        uint256 minDue = (due * (10000 - feeToleranceBps)) / 10000;
        if (msg.value < minDue) revert Underpay();

        uint256 extra = 0;
        if (msg.value > reportedGasWei) {
            extra = msg.value - reportedGasWei;
        }
        emit MovePaid(ownerAddr, msg.sender, reportedGasWei, extra);
        // ETH stays as treasury for owner withdrawal
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "to=0");
        require(address(this).balance >= amount, "insufficient");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(to, amount);
    }

    function unitPrice() external view returns (uint256) {
        uint256 basefee = block.basefee;
        uint256 maxFee = basefee > 0 ? basefee : 10 gwei; // fallback if EIP-1559 not active
        return (21000 * maxFee * (10000 + feeMultiplierBps)) / 10000;
    }

    function setFeeParams(uint16 multBps, uint16 tolBps) external onlyOwner {
        require(multBps <= 50000, "mult too high"); // up to 5x
        require(tolBps <= 5000, "tol too high");    // up to 50%
        feeMultiplierBps = multBps;
        feeToleranceBps = tolBps;
    }

    function authorizeContract(address contractAddr) external onlyOwner {
        require(contractAddr != address(0), "contract=0");
        authorizedContracts[contractAddr] = true;
    }

    function revokeContract(address contractAddr) external onlyOwner {
        authorizedContracts[contractAddr] = false;
    }
}
