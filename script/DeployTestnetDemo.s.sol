// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ManagedAaveVault} from "../src/ManagedAaveVault.sol";
import {TestnetAavePoolHarness} from "../src/demo/TestnetAavePoolHarness.sol";
import {TestnetToken} from "../src/demo/TestnetToken.sol";

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
        TestnetToken weth = new TestnetToken("Testnet Wrapped Ether", "WETH", 18, deployer);
        TestnetToken wsteth = new TestnetToken("Testnet Wrapped stETH", "wstETH", 18, deployer);
        TestnetToken usdc = new TestnetToken("Testnet USD Coin", "USDC", 6, deployer);
        TestnetToken ausd = new TestnetToken("Testnet Agora Dollar", "AUSD", 6, deployer);
        TestnetToken usde = new TestnetToken("Testnet Ethena USDe", "USDe", 18, deployer);
        pool = new TestnetAavePoolHarness(deployer);
        vault = new ManagedAaveVault(pool, deployer, deployer, TARGET_HEALTH_FACTOR);
        _fundAndSeed(pool, vault, weth, 18);
        _fundAndSeed(pool, vault, wsteth, 18);
        _fundAndSeed(pool, vault, usdc, 6);
        _fundAndSeed(pool, vault, ausd, 6);
        _fundAndSeed(pool, vault, usde, 18);
        pool.setHealthFactors(address(vault), TARGET_HEALTH_FACTOR, TARGET_HEALTH_FACTOR);
        vm.stopBroadcast();
    }

    function _fundAndSeed(TestnetAavePoolHarness pool, ManagedAaveVault vault, TestnetToken token, uint8 decimals)
        private
    {
        uint256 unit = 10 ** uint256(decimals);
        token.mint(address(pool), 1_000_000_000 * unit);
        token.mint(address(vault), 1_000_000_000 * unit);
        pool.seedPosition(address(vault), address(token), 100_000_000 * unit, 50_000 * unit);
    }
}
