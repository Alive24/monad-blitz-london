// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ManagedAaveVault} from "../src/ManagedAaveVault.sol";
import {MockAavePool} from "./mocks/MockAavePool.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

interface Vm {
    function prank(address caller) external;
    function expectRevert(bytes calldata revertData) external;
}

contract ManagedAaveVaultTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant OWNER = address(0xA11CE);
    address private constant EXECUTOR = address(0xE11EC);
    uint256 private constant TARGET = 1.75e18;

    MockAavePool private pool;
    MockERC20 private collateral;
    MockERC20 private debtAsset;
    ManagedAaveVault private vault;

    function setUp() public {
        pool = new MockAavePool();
        collateral = new MockERC20("Collateral");
        debtAsset = new MockERC20("Debt asset");
        vault = new ManagedAaveVault(pool, OWNER, EXECUTOR, TARGET);
        collateral.mint(address(vault), 100 ether);
        debtAsset.mint(address(pool), 100 ether);
    }

    function testExecutesAssetBasketOnlyBelowTarget() public {
        pool.setHealthFactors(1.6e18, 1.8e18);
        ManagedAaveVault.Action[] memory actions = new ManagedAaveVault.Action[](2);
        actions[0] = ManagedAaveVault.Action(ManagedAaveVault.ActionType.SUPPLY, address(collateral), 20 ether);
        actions[1] = ManagedAaveVault.Action(ManagedAaveVault.ActionType.BORROW, address(debtAsset), 5 ether);

        vm.prank(EXECUTOR);
        vault.execute(actions);

        _assertEq(collateral.balanceOf(address(pool)), 20 ether, "collateral supplied");
        _assertEq(debtAsset.balanceOf(address(vault)), 5 ether, "asset borrowed");
        _assertEq(vault.healthFactor(), 1.8e18, "target restored");
    }

    function testRejectsRebalanceWhenHealthy() public {
        pool.setHealthFactors(1.8e18, 1.8e18);
        ManagedAaveVault.Action[] memory actions = new ManagedAaveVault.Action[](1);
        actions[0] = ManagedAaveVault.Action(ManagedAaveVault.ActionType.SUPPLY, address(collateral), 1 ether);

        vm.expectRevert(abi.encodeWithSelector(ManagedAaveVault.HealthFactorAtOrAboveTarget.selector, 1.8e18, TARGET));
        vm.prank(EXECUTOR);
        vault.execute(actions);
    }

    function testRevertsUnlessTargetIsRestored() public {
        pool.setHealthFactors(1.6e18, 1.7e18);
        ManagedAaveVault.Action[] memory actions = new ManagedAaveVault.Action[](1);
        actions[0] = ManagedAaveVault.Action(ManagedAaveVault.ActionType.SUPPLY, address(collateral), 1 ether);

        vm.expectRevert(abi.encodeWithSelector(ManagedAaveVault.TargetHealthFactorNotRestored.selector, 1.7e18, TARGET));
        vm.prank(EXECUTOR);
        vault.execute(actions);
    }

    function testRejectsUnknownCaller() public {
        ManagedAaveVault.Action[] memory actions = new ManagedAaveVault.Action[](1);
        actions[0] = ManagedAaveVault.Action(ManagedAaveVault.ActionType.SUPPLY, address(collateral), 1 ether);

        vm.expectRevert(abi.encodeWithSelector(ManagedAaveVault.Unauthorized.selector));
        vault.execute(actions);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }
}
