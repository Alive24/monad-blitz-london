import { formatUnits, getAddress, parseUnits } from "viem";
import { aavePoolAbi, managedVaultAbi, testnetHarnessAbi } from "./abi.js";
import { account, publicClient, walletClient } from "./client.js";
import { requireEnv } from "./env.js";

const vault = getAddress(requireEnv("MANAGED_VAULT_ADDRESS"));
const pool = getAddress(requireEnv("AAVE_POOL_ADDRESS"));
const owner = await publicClient.readContract({ address: pool, abi: testnetHarnessAbi, functionName: "owner" });
if (owner !== account.address) throw new Error("Configured Pool is not the signer-owned testnet harness.");

const targetHealthFactor = await publicClient.readContract({
  address: vault,
  abi: managedVaultAbi,
  functionName: "targetHealthFactor",
});
const stressedHealthFactor = parseUnits("1.60", 18);

const { request: stressRequest } = await publicClient.simulateContract({
  account,
  address: pool,
  abi: testnetHarnessAbi,
  functionName: "setHealthFactors",
  args: [vault, stressedHealthFactor, targetHealthFactor],
});
const stressHash = await walletClient.writeContract(stressRequest);
await publicClient.waitForTransactionReceipt({ hash: stressHash });

const { request: executeRequest } = await publicClient.simulateContract({
  account,
  address: vault,
  abi: managedVaultAbi,
  functionName: "execute",
  args: [[{ actionType: 2, asset: pool, amount: 1n }]],
});
const executeHash = await walletClient.writeContract(executeRequest);
await publicClient.waitForTransactionReceipt({ hash: executeHash });

const accountData = await publicClient.readContract({
  address: pool,
  abi: aavePoolAbi,
  functionName: "getUserAccountData",
  args: [vault],
});

console.log(`HF transition: ${formatUnits(stressedHealthFactor, 18)} → ${formatUnits(accountData[5], 18)}`);
console.log(`Stress transaction: https://testnet.monadscan.com/tx/${stressHash}`);
console.log(`Vault transaction: https://testnet.monadscan.com/tx/${executeHash}`);
