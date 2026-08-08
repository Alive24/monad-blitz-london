// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAavePool} from "../interfaces/IAavePool.sol";

/// @notice Testnet-only Aave Pool surface for proving deployment, HF reads, and executor gating.
/// @dev This is not an Aave market and must never be used with valuable assets.
contract TestnetAavePoolHarness is IAavePool {
    address public immutable owner;
    mapping(address => uint256) public healthFactors;
    mapping(address => uint256) public postActionHealthFactors;

    error Unauthorized();

    event HarnessHealthFactorsSet(address indexed user, uint256 currentHealthFactor, uint256 postActionHealthFactor);
    event HarnessAction(address indexed caller, uint8 indexed actionType, address indexed asset, uint256 amount);

    constructor(address owner_) {
        owner = owner_;
    }

    function setHealthFactors(address user, uint256 currentHealthFactor, uint256 postActionHealthFactor) external {
        if (msg.sender != owner) revert Unauthorized();
        healthFactors[user] = currentHealthFactor;
        postActionHealthFactors[user] = postActionHealthFactor;
        emit HarnessHealthFactorsSet(user, currentHealthFactor, postActionHealthFactor);
    }

    function supply(address asset, uint256 amount, address, uint16) external {
        emit HarnessAction(msg.sender, 0, asset, amount);
        _afterAction(msg.sender);
    }

    function withdraw(address asset, uint256 amount, address) external returns (uint256) {
        emit HarnessAction(msg.sender, 1, asset, amount);
        _afterAction(msg.sender);
        return amount;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address) external {
        emit HarnessAction(msg.sender, 2, asset, amount);
        _afterAction(msg.sender);
    }

    function repay(address asset, uint256 amount, uint256, address) external returns (uint256) {
        emit HarnessAction(msg.sender, 3, asset, amount);
        _afterAction(msg.sender);
        return amount;
    }

    function getUserAccountData(address user)
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        return (0, 0, 0, 0, 0, healthFactors[user]);
    }

    function _afterAction(address user) private {
        uint256 postAction = postActionHealthFactors[user];
        if (postAction != 0) healthFactors[user] = postAction;
    }
}
