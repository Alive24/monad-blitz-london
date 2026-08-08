// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAavePool} from "../interfaces/IAavePool.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

/// @notice Testnet-only Aave Pool surface for proving deployment, HF reads, and executor gating.
/// @dev This is not an Aave market and must never be used with valuable assets.
contract TestnetAavePoolHarness is IAavePool {
    using SafeTransferLib for IERC20;

    address public immutable owner;
    mapping(address => uint256) public healthFactors;
    mapping(address => uint256) public postActionHealthFactors;
    mapping(address => mapping(address => uint256)) public supplied;
    mapping(address => mapping(address => uint256)) public borrowed;

    error Unauthorized();
    error InsufficientSuppliedBalance(address user, address asset, uint256 requested, uint256 available);

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

    function seedPosition(address user, address asset, uint256 suppliedAmount, uint256 borrowedAmount) external {
        if (msg.sender != owner) revert Unauthorized();
        supplied[user][asset] = suppliedAmount;
        borrowed[user][asset] = borrowedAmount;
    }

    function positionOf(address user, address asset)
        external
        view
        returns (uint256 suppliedAmount, uint256 borrowedAmount)
    {
        return (supplied[user][asset], borrowed[user][asset]);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        supplied[onBehalfOf][asset] += amount;
        emit HarnessAction(msg.sender, 0, asset, amount);
        _afterAction(onBehalfOf);
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        uint256 available = supplied[msg.sender][asset];
        if (amount > available) revert InsufficientSuppliedBalance(msg.sender, asset, amount, available);
        supplied[msg.sender][asset] = available - amount;
        IERC20(asset).safeTransfer(to, amount);
        emit HarnessAction(msg.sender, 1, asset, amount);
        _afterAction(msg.sender);
        return amount;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address onBehalfOf) external {
        borrowed[onBehalfOf][asset] += amount;
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit HarnessAction(msg.sender, 2, asset, amount);
        _afterAction(onBehalfOf);
    }

    function repay(address asset, uint256 amount, uint256, address onBehalfOf) external returns (uint256 repaid) {
        uint256 outstanding = borrowed[onBehalfOf][asset];
        repaid = amount < outstanding ? amount : outstanding;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), repaid);
        borrowed[onBehalfOf][asset] = outstanding - repaid;
        emit HarnessAction(msg.sender, 3, asset, repaid);
        _afterAction(onBehalfOf);
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
