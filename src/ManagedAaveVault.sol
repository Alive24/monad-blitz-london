// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAavePool} from "./interfaces/IAavePool.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";

/// @notice Hackathon managed vault executor for atomic, asset-level Aave V3 rebalances.
/// @dev The optimizer is deliberately asymmetric: execution is blocked while HF is at or above target.
contract ManagedAaveVault {
    using SafeTransferLib for IERC20;

    uint256 public constant WAD = 1e18;
    uint256 public constant VARIABLE_INTEREST_RATE_MODE = 2;

    enum ActionType {
        SUPPLY,
        WITHDRAW,
        BORROW,
        REPAY
    }

    struct Action {
        ActionType actionType;
        address asset;
        uint256 amount;
    }

    IAavePool public immutable pool;
    address public owner;
    address public executor;
    uint256 public targetHealthFactor;
    uint256 private locked = 1;

    error Unauthorized();
    error ZeroAddress();
    error InvalidPool(address pool);
    error ZeroAmount();
    error EmptyActions();
    error InvalidTargetHealthFactor(uint256 targetHealthFactor);
    error HealthFactorAtOrAboveTarget(uint256 currentHealthFactor, uint256 targetHealthFactor);
    error TargetHealthFactorNotRestored(uint256 finalHealthFactor, uint256 targetHealthFactor);
    error Reentrancy();

    event ExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event TargetHealthFactorUpdated(uint256 previousTarget, uint256 newTarget);
    event AssetDeposited(address indexed asset, uint256 amount);
    event ActionExecuted(uint256 indexed index, ActionType indexed actionType, address indexed asset, uint256 amount);
    event Rebalanced(uint256 healthFactorBefore, uint256 healthFactorAfter);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(IAavePool pool_, address owner_, address executor_, uint256 targetHealthFactor_) {
        if (address(pool_) == address(0) || owner_ == address(0) || executor_ == address(0)) revert ZeroAddress();
        if (address(pool_).code.length == 0) revert InvalidPool(address(pool_));
        if (targetHealthFactor_ <= WAD) revert InvalidTargetHealthFactor(targetHealthFactor_);
        pool = pool_;
        owner = owner_;
        executor = executor_;
        targetHealthFactor = targetHealthFactor_;
    }

    function healthFactor() public view returns (uint256 result) {
        (,,,,, result) = pool.getUserAccountData(address(this));
    }

    function deposit(address asset, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        emit AssetDeposited(asset, amount);
    }

    /// @notice Executes the optimizer's ordered action basket only after HF has fallen below target.
    /// @dev Reverts atomically unless the resulting Aave position restores at least the configured target HF.
    function execute(Action[] calldata actions) external onlyExecutor nonReentrant {
        if (actions.length == 0) revert EmptyActions();

        uint256 healthFactorBefore = healthFactor();
        if (healthFactorBefore >= targetHealthFactor) {
            revert HealthFactorAtOrAboveTarget(healthFactorBefore, targetHealthFactor);
        }

        for (uint256 index; index < actions.length; ++index) {
            Action calldata action = actions[index];
            if (action.asset == address(0)) revert ZeroAddress();
            if (action.amount == 0) revert ZeroAmount();

            uint256 executedAmount = action.amount;
            if (action.actionType == ActionType.SUPPLY) {
                IERC20(action.asset).forceApprove(address(pool), action.amount);
                pool.supply(action.asset, action.amount, address(this), 0);
            } else if (action.actionType == ActionType.WITHDRAW) {
                executedAmount = pool.withdraw(action.asset, action.amount, address(this));
            } else if (action.actionType == ActionType.BORROW) {
                pool.borrow(action.asset, action.amount, VARIABLE_INTEREST_RATE_MODE, 0, address(this));
            } else {
                IERC20(action.asset).forceApprove(address(pool), action.amount);
                executedAmount = pool.repay(action.asset, action.amount, VARIABLE_INTEREST_RATE_MODE, address(this));
            }

            emit ActionExecuted(index, action.actionType, action.asset, executedAmount);
        }

        uint256 healthFactorAfter = healthFactor();
        if (healthFactorAfter < targetHealthFactor) {
            revert TargetHealthFactorNotRestored(healthFactorAfter, targetHealthFactor);
        }
        emit Rebalanced(healthFactorBefore, healthFactorAfter);
    }

    function setExecutor(address newExecutor) external onlyOwner {
        if (newExecutor == address(0)) revert ZeroAddress();
        emit ExecutorUpdated(executor, newExecutor);
        executor = newExecutor;
    }

    function setTargetHealthFactor(uint256 newTarget) external onlyOwner {
        if (newTarget <= WAD) revert InvalidTargetHealthFactor(newTarget);
        emit TargetHealthFactorUpdated(targetHealthFactor, newTarget);
        targetHealthFactor = newTarget;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    function recoverToken(address asset, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(asset).safeTransfer(to, amount);
    }
}
