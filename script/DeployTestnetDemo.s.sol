// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ManagedAaveVault} from "../src/ManagedAaveVault.sol";
import {TestnetAavePoolHarness} from "../src/demo/TestnetAavePoolHarness.sol";

interface DemoVm {
    function envUint(string calldata name) external view returns (uint256);
    function addr(uint256 privateKey) external pure returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployTestnetDemo {
    DemoVm private constant vm = DemoVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant TARGET_HEALTH_FACTOR = 1.75e18;

    function run() external returns (TestnetAavePoolHarness pool, ManagedAaveVault vault) {
        uint256 deployerKey = vm.envUint("MONAD_TESTNET_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        pool = new TestnetAavePoolHarness(deployer);
        vault = new ManagedAaveVault(pool, deployer, deployer, TARGET_HEALTH_FACTOR);
        pool.setHealthFactors(address(vault), TARGET_HEALTH_FACTOR, TARGET_HEALTH_FACTOR);
        vm.stopBroadcast();
    }
}
