// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITarget {
    function unitPrice() external view returns (uint256);
    function flap(uint256 reportedGasWei) external payable; // generic action per click
}

contract ClickBatchRouter {
    error BadTimes();
    error BadValue();
    event BatchProcessed(address indexed sender, uint256 requested, uint256 succeeded, uint256 failed, uint256 unitPrice);

    ITarget public immutable target;
    uint256 public constant MAX_TIMES = 64;

    constructor(address _target) {
        target = ITarget(_target);
    }

    // Reverts all on any failure
    function doThingBatch(uint256 times) external payable {
        if (times == 0 || times > MAX_TIMES) revert BadTimes();
        uint256 price = target.unitPrice();
        if (msg.value != price * times) revert BadValue();
        for (uint256 i; i < times; ++i) {
            target.flap{value: price}(21000 * block.basefee); // reportedGasWei
        }
        emit BatchProcessed(msg.sender, times, times, 0, price);
    }

    // Continues on failure, logs outcome
    function doThingBatchBestEffort(uint256 times) external payable {
        if (times == 0 || times > MAX_TIMES) revert BadTimes();
        uint256 price = target.unitPrice();
        if (msg.value != price * times) revert BadValue();
        uint256 ok;
        for (uint256 i; i < times; ++i) {
            (bool success, ) = address(target).call{value: price}(abi.encodeWithSelector(ITarget.flap.selector, 21000 * block.basefee));
            if (success) { unchecked { ++ok; } }
        }
        emit BatchProcessed(msg.sender, times, ok, times - ok, price);
    }

    function sweep(address payable to) external {
        to.transfer(address(this).balance);
    }

    receive() external payable {}
}
