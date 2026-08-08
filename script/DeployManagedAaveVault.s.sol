// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ManagedAaveVault} from "../src/ManagedAaveVault.sol";
import {IAavePool} from "../src/interfaces/IAavePool.sol";

interface Vm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function addr(uint256 privateKey) external pure returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}
contract DeployManagedAaveVault {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant INITIAL_TARGET_HEALTH_FACTOR = 1.75e18;

    function run() external returns (ManagedAaveVault vault) {
        uint256 deployerKey = vm.envUint("MONAD_TESTNET_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address pool = vm.envAddress("AAVE_POOL_ADDRESS");

        vm.startBroadcast(deployerKey);
        vault = new ManagedAaveVault(IAavePool(pool), deployer, deployer, INITIAL_TARGET_HEALTH_FACTOR);
        vm.stopBroadcast();
    }
}
