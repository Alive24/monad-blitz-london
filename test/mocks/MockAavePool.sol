// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAavePool} from "../../src/interfaces/IAavePool.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

contract MockAavePool is IAavePool {
    uint256 public healthFactor = 1.75e18;
    uint256 public postActionHealthFactor;

    function setHealthFactors(uint256 beforeAction, uint256 afterAction) external {
        healthFactor = beforeAction;
        postActionHealthFactor = afterAction;
    }

    function supply(address asset, uint256 amount, address, uint16) external {
        require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        _afterAction();
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        require(IERC20(asset).transfer(to, amount), "transfer failed");
        _afterAction();
        return amount;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address) external {
        require(IERC20(asset).transfer(msg.sender, amount), "transfer failed");
        _afterAction();
    }

    function repay(address asset, uint256 amount, uint256, address) external returns (uint256) {
        require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        _afterAction();
        return amount;
    }

    function getUserAccountData(address) external view returns (uint256, uint256, uint256, uint256, uint256, uint256) {
        return (0, 0, 0, 0, 0, healthFactor);
    }

    function _afterAction() private {
        if (postActionHealthFactor != 0) healthFactor = postActionHealthFactor;
    }
}
