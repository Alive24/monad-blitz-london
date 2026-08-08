// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ManagedAaveVault} from "../src/ManagedAaveVault.sol";
import {TestnetAavePoolHarness} from "../src/demo/TestnetAavePoolHarness.sol";
import {TestnetToken} from "../src/demo/TestnetToken.sol";

contract TestnetHarnessTest {
    uint256 private constant TARGET = 1.75e18;

    function testMovesTokensAndTracksPositions() public {
        TestnetToken token = new TestnetToken("Test token", "TEST", 18, address(this));
        TestnetAavePoolHarness pool = new TestnetAavePoolHarness(address(this));
        ManagedAaveVault vault = new ManagedAaveVault(pool, address(this), address(this), TARGET);

        token.mint(address(pool), 1_000 ether);
        token.mint(address(vault), 1_000 ether);
        pool.seedPosition(address(vault), address(token), 100 ether, 50 ether);
        pool.setHealthFactors(address(vault), 1.6e18, TARGET);

        ManagedAaveVault.Action[] memory actions = new ManagedAaveVault.Action[](2);
        actions[0] = ManagedAaveVault.Action(ManagedAaveVault.ActionType.SUPPLY, address(token), 10 ether);
        actions[1] = ManagedAaveVault.Action(ManagedAaveVault.ActionType.BORROW, address(token), 2 ether);
        vault.execute(actions);

        (uint256 supplied, uint256 borrowed) = pool.positionOf(address(vault), address(token));
        require(supplied == 110 ether, "supplied position");
        require(borrowed == 52 ether, "borrowed position");
        require(token.balanceOf(address(vault)) == 992 ether, "vault token balance");
        require(vault.healthFactor() == TARGET, "health restored");
    }
}
