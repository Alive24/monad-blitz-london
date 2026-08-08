// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ManagedAaveVault} from "../src/ManagedAaveVault.sol";
import {TestnetAavePoolHarness} from "../src/demo/TestnetAavePoolHarness.sol";
import {TestnetToken} from "../src/demo/TestnetToken.sol";

interface TestVm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

contract TestnetHarnessTest {
    TestVm private constant vm = TestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant TARGET = 1.75e18;
    bytes32 private constant TRANSFER_TOPIC = keccak256("Transfer(address,address,uint256)");
    bytes32 private constant APPROVAL_TOPIC = keccak256("Approval(address,address,uint256)");

    function testTokenEmitsStandardErc20Events() public {
        TestnetToken token = new TestnetToken("Test token", "TEST", 18, address(this));
        address recipient = address(0xBEEF);

        vm.recordLogs();
        token.mint(address(this), 10 ether);
        token.approve(address(this), 4 ether);
        token.transfer(recipient, 3 ether);
        token.transferFrom(address(this), recipient, 2 ether);
        TestVm.Log[] memory logs = vm.getRecordedLogs();

        require(_countTopic(logs, TRANSFER_TOPIC) == 3, "missing Transfer events");
        require(_countTopic(logs, APPROVAL_TOPIC) == 1, "missing Approval event");
    }

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
        vm.recordLogs();
        vault.execute(actions);
        TestVm.Log[] memory logs = vm.getRecordedLogs();

        (uint256 supplied, uint256 borrowed) = pool.positionOf(address(vault), address(token));
        require(supplied == 110 ether, "supplied position");
        require(borrowed == 52 ether, "borrowed position");
        require(token.balanceOf(address(vault)) == 992 ether, "vault token balance");
        require(vault.healthFactor() == TARGET, "health restored");
        require(_countTopic(logs, TRANSFER_TOPIC) == 2, "vault transfers not indexable");
        require(_countTopic(logs, APPROVAL_TOPIC) == 1, "vault approval not indexable");
    }

    function _countTopic(TestVm.Log[] memory logs, bytes32 topic) private pure returns (uint256 count) {
        for (uint256 index; index < logs.length; ++index) {
            if (logs[index].topics.length != 0 && logs[index].topics[0] == topic) ++count;
        }
    }
}
